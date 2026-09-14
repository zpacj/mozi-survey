/**
 * MOZI 问卷系统后端
 * 启动：npm install && node server.js
 * 默认端口：3000（可通过环境变量 PORT 修改）
 * 数据库：SQLite 文件 ./data/surveys.db（自动创建）
 *
 * 环境变量：
 *   PORT       监听端口（默认 3000）
 *   API_KEY    启用后，提交问卷需要带 X-API-Key 头（可选）
 *   TRUST_PROXY 设为 1 时信任第一层反向代理（用于 Nginx）
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'surveys.db');
const LOG_DIR = path.join(__dirname, 'logs');

// 确保数据/日志目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// 初始化数据库
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_no TEXT UNIQUE,
    submitted_at TEXT NOT NULL,
    company_name TEXT,
    respondent_name TEXT,
    company_type TEXT,
    v1_industry TEXT,
    v2_scale TEXT,
    v10_job TEXT,
    completion_rate INTEGER DEFAULT 0,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_submitted_at ON surveys(submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_company ON surveys(company_name);
`);

const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 简单的访问日志
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// ===== API 鉴权（中间件） =====
// 设置 API_KEY 环境变量后启用；管理类接口都需要 key，提交接口可选
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // 未启用鉴权则放行
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key === API_KEY) return next();
  res.status(401).json({ error: '未授权：缺少有效的 API Key' });
}

// 静态托管 HTML（与本文件同目录的 MOZI问卷.html）
app.use(express.static(__dirname));

// ===== API =====

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 提交问卷
app.post('/api/surveys', (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '无效的数据' });
    }

    const submittedAt = data._submitted_at || new Date().toISOString();
    const interviewNo = `MOZI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // 计算完成率：必填字段中已填比例
    const requiredKeys = (data._required_keys && Array.isArray(data._required_keys)) ? data._required_keys : [];
    let filled = 0;
    requiredKeys.forEach(k => {
      const v = data[k];
      const ok = Array.isArray(v) ? v.some(x => x && String(x).trim()) : (v !== null && v !== undefined && String(v).trim() !== '');
      if (ok) filled++;
    });
    const completion = requiredKeys.length > 0 ? Math.round((filled / requiredKeys.length) * 100) : 100;

    const stmt = db.prepare(`
      INSERT INTO surveys (interview_no, submitted_at, company_name, respondent_name, company_type,
                          v1_industry, v2_scale, v10_job, completion_rate, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      interviewNo,
      submittedAt,
      data.company_name || '',
      data.respondent_name || '',
      data.company_type || '',
      data.V1_industry || '',
      data.V2_scale || '',
      Array.isArray(data.V10_job) ? data.V10_job.join(',') : (data.V10_job || ''),
      completion,
      JSON.stringify(data)
    );

    res.json({
      ok: true,
      id: info.lastInsertRowid,
      interview_no: interviewNo,
      completion_rate: completion
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '保存失败：' + e.message });
  }
});

// 列表（不返回完整 payload，只返回摘要）
app.get('/api/surveys', requireApiKey, (req, res) => {
  try {
    const { q, company, job, scale, sort = 'submitted_at', order = 'desc', limit = 200, offset = 0 } = req.query;
    const allowedSort = ['submitted_at', 'company_name', 'completion_rate'];
    const sortCol = allowedSort.includes(sort) ? sort : 'submitted_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const where = [];
    const params = {};
    if (q) {
      where.push(`(company_name LIKE @q OR respondent_name LIKE @q OR interview_no LIKE @q)`);
      params.q = `%${q}%`;
    }
    if (company) {
      where.push(`company_name LIKE @company`);
      params.company = `%${company}%`;
    }
    if (job) {
      where.push(`v10_job LIKE @job`);
      params.job = `%${job}%`;
    }
    if (scale) {
      where.push(`v2_scale = @scale`);
      params.scale = scale;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS c FROM surveys ${whereSql}`).get(params).c;
    const rows = db.prepare(`
      SELECT id, interview_no, submitted_at, company_name, respondent_name, company_type,
             v1_industry, v2_scale, v10_job, completion_rate
      FROM surveys
      ${whereSql}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: Number(limit) || 200, offset: Number(offset) || 0 });

    res.json({ total, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '查询失败：' + e.message });
  }
});

// 详情（返回完整 payload）
app.get('/api/surveys/:id', requireApiKey, (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM surveys WHERE id = ? OR interview_no = ?`).get(req.params.id, req.params.id);
    if (!row) return res.status(404).json({ error: '未找到该问卷' });
    res.json({
      ...row,
      payload: JSON.parse(row.payload)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除
app.delete('/api/surveys/:id', requireApiKey, (req, res) => {
  try {
    const info = db.prepare(`DELETE FROM surveys WHERE id = ? OR interview_no = ?`).run(req.params.id, req.params.id);
    res.json({ ok: true, deleted: info.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 批量清空（带确认参数 ?confirm=YES）
app.delete('/api/surveys', requireApiKey, (req, res) => {
  if (req.query.confirm !== 'YES') {
    return res.status(400).json({ error: '需要 confirm=YES 参数才允许清空' });
  }
  try {
    const info = db.prepare(`DELETE FROM surveys`).run();
    res.json({ ok: true, deleted: info.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 统计概览
app.get('/api/stats', requireApiKey, (req, res) => {
  try {
    const total = db.prepare(`SELECT COUNT(*) AS c FROM surveys`).get().c;
    const avgCompletion = db.prepare(`SELECT AVG(completion_rate) AS a FROM surveys`).get().a || 0;
    const byCompanyType = db.prepare(`
      SELECT company_type, COUNT(*) AS c FROM surveys
      WHERE company_type IS NOT NULL AND company_type != ''
      GROUP BY company_type ORDER BY c DESC
    `).all();
    const byScale = db.prepare(`
      SELECT v2_scale AS scale, COUNT(*) AS c FROM surveys
      WHERE v2_scale IS NOT NULL AND v2_scale != ''
      GROUP BY v2_scale ORDER BY c DESC
    `).all();
    const byJob = db.prepare(`
      SELECT v10_job AS job, COUNT(*) AS c FROM surveys
      WHERE v10_job IS NOT NULL AND v10_job != ''
      GROUP BY v10_job ORDER BY c DESC
    `).all();
    res.json({
      total,
      avg_completion: Math.round(avgCompletion),
      by_company_type: byCompanyType,
      by_scale: byScale,
      by_job: byJob
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 批量导出
app.get('/api/export', requireApiKey, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM surveys ORDER BY submitted_at DESC`).all();
    const items = rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
    res.setHeader('Content-Disposition', `attachment; filename="MOZI问卷全部_${new Date().toISOString().slice(0,10)}.json"`);
    res.json({ exported_at: new Date().toISOString(), count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 启动
app.listen(PORT, () => {
  console.log(`\n🚀 MOZI 问卷服务已启动`);
  console.log(`📊 管理界面: http://localhost:${PORT}/MOZI问卷.html`);
  console.log(`🔌 API 地址: http://localhost:${PORT}/api/surveys`);
  console.log(`💾 数据库文件: ${DB_PATH}\n`);
});
