# MOZI 问卷系统

> 制造业方向深访问卷收集与分析系统（前端 + 后端 + 数据库一体化）

## 📁 文件说明

```
问卷word/
├── MOZI问卷.html      # 前端问卷 + 管理面板（单文件）
├── server.js          # Node.js 后端
├── package.json       # 后端依赖清单
├── data/
│   └── surveys.db     # SQLite 数据库（首次启动自动创建）
└── README.md          # 本文档
```

## 🚀 快速启动（本地开发）

### 1. 安装 Node.js

如果电脑没有 Node.js，先到 https://nodejs.org/ 下载 LTS 版本（v18+）。

### 2. 安装依赖

在 `问卷word` 目录下打开终端（PowerShell / CMD），运行：

```bash
npm install
```

### 3. 启动后端

```bash
node server.js
```

看到下面的输出就说明成功了：

```
🚀 MOZI 问卷服务已启动
📊 管理界面: http://localhost:3000/MOZI问卷.html
🔌 API 地址: http://localhost:3000/api/surveys
💾 数据库文件: .../data/surveys.db
```

### 4. 打开浏览器

访问：**http://localhost:3000/MOZI问卷.html**

> ⚠️ **一定要通过 `http://localhost:3000/` 访问**，不能直接双击 HTML 文件，否则 API 连不上。

## 🎯 功能一览

### 填写问卷（Tab 1）
- V1-V10 变量信息快速勾选
- Q1-Q10 复合必填题，每题拆分子问题 + 核心追问 + 详细回答
- 实时进度条
- 必填校验，提交时自动定位未填项
- 提交后自动 POST 到后端保存
- 支持导出 JSON / 打印 PDF

### 问卷管理（Tab 2）
- 📊 **统计概览**：总数、平均完成率、公司数、覆盖岗位数
- 🔍 **筛选搜索**：按公司名 / 受访者 / 编号 / 规模 / 岗位筛选
- 📋 **列表展示**：每份问卷显示编号、公司、规模、岗位、提交时间、完成率
- 📖 **详情展开**：点击 ▾ 展开查看完整答案（按节分组）
- 📥 **单份导出**：下载任意一份问卷为 JSON
- 🗑 **删除单份 / 清空全部**
- 📥 **批量导出**：一键导出所有问卷

## 🔌 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| POST | `/api/surveys` | 提交问卷 |
| GET  | `/api/surveys` | 列表（支持 q / scale / job / sort / order / limit / offset） |
| GET  | `/api/surveys/:id` | 详情 |
| DELETE | `/api/surveys/:id` | 删除单份 |
| DELETE | `/api/surveys?confirm=YES` | 清空全部 |
| GET  | `/api/stats` | 统计概览 |
| GET  | `/api/export` | 批量导出（JSON 文件下载） |

## 🌐 部署到服务器

### 方式一：直接部署（推荐）

把整个 `问卷word` 目录上传到服务器（任何 Linux / Windows 机器都行），然后：

```bash
# 在服务器上
cd /path/to/问卷word
npm install
node server.js
```

默认监听 3000 端口。访问 `http://服务器IP:3000/MOZI问卷.html` 即可。

### 方式二：用 PM2 守护进程

```bash
npm install -g pm2
pm2 start server.js --name mozi-survey
pm2 save
pm2 startup
```

### 方式三：用 Nginx 反向代理 + HTTPS

在 nginx 配置里加：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

然后用 certbot 配置 HTTPS：

```bash
sudo certbot --nginx -d your-domain.com
```

### 跨域部署（前端和后端不同域名）

如果 HTML 部署在 `https://问卷.example.com`，后端在 `https://api.example.com:3000`，
需要修改 `MOZI问卷.html` 顶部的 `API_BASE`：

```html
<script>
const API_BASE = 'https://api.example.com';
</script>
```

## ⚙️ 配置选项

通过环境变量：

```bash
PORT=8080 node server.js  # 修改端口
```

## 🗃 数据库

使用 SQLite，数据存储在 `data/surveys.db`。优势：
- 零配置，无需安装数据库服务
- 单文件，方便备份（直接复制即可）
- 适合中小规模（万级数据无压力）

### 备份数据

直接复制 `data/surveys.db` 文件即可。也可以通过管理面板「📥 导出全部」下载 JSON。

### 重置数据库

```bash
rm data/surveys.db
# 再次启动会自动重建
```

## 🔒 安全提示

- 后端默认无鉴权，任何能访问到的人都能查看/删除/导出所有数据
- 部署到公网前建议加：
  - **基础认证**（Nginx 层加 HTTP Basic Auth）
  - 或**简单 token 校验**：修改 `server.js`，在 API 前检查 `req.headers['x-api-key']`
  - 或部署到内网 / VPN

## ❓ 常见问题

**Q: 浏览器打开 HTML 后显示「无法连接后端」？**
A: 请通过 `http://localhost:3000/MOZI问卷.html` 访问（不要直接双击 HTML）。

**Q: 端口 3000 被占用？**
A: 用其他端口启动：`PORT=8080 node server.js`，访问时也用 8080。

**Q: 我可以换数据库吗（比如 MySQL）？**
A: 可以，`server.js` 里所有 SQL 操作都集中在一处，改为 mysql2/pg 即可。

**Q: 多人同时填写会不会冲突？**
A: 不会，每份问卷独立保存，SQLite 支持并发读 + 单写锁。
