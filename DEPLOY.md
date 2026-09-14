# MOZI 问卷系统 · 云端部署完整指南

> 目标：从本地 Windows 电脑，把问卷系统部署到阿里云/腾讯云轻量服务器，使用 GitHub 管理代码，配置 HTTPS，全程约 30 分钟。

---

## 📋 部署架构总览

```
┌─────────────────┐
│  你的电脑 (Win) │
│   Git + PowerShell│
└────────┬────────┘
         │ git push
         ▼
┌─────────────────┐
│   GitHub 仓库    │  (私有仓库)
│  mozi-survey    │
└────────┬────────┘
         │ git pull (ssh)
         ▼
┌──────────────────────────────────────┐
│  云服务器 (Ubuntu 22.04)             │
│  ┌────────────┐  ┌────────────────┐  │
│  │  Nginx     │←→│ Node.js + PM2 │  │
│  │  80/443    │  │ :3000          │  │
│  └────────────┘  └────────┬───────┘  │
│                           │           │
│                  ┌────────▼──────┐    │
│                  │ SQLite 文件   │    │
│                  │ /opt/mozi/data│    │
│                  └───────────────┘    │
└──────────────────────────────────────┘
```

---

## 🎯 第一部分：服务器初始化（约 10 分钟）

### 步骤 1：登录服务器

**Windows PowerShell**：
```powershell
ssh root@你的服务器公网IP
# 首次连接输入 yes，然后输入密码
```

> 💡 阿里云/腾讯云默认 root 密码是你在控制台「重置实例密码」时设置的。

### 步骤 2：系统更新

```bash
apt update && apt upgrade -y
```

### 步骤 3：安装基础工具

```bash
apt install -y curl git ufw
```

### 步骤 4：配置防火墙

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
# 输入 y 确认
```

### 步骤 5：（可选）配置 SSH Key 免密登录

**在本地 PowerShell**（不要在服务器上）：
```powershell
# 生成密钥（如果已有可跳过）
ssh-keygen -t ed25519 -f $HOME\.ssh\mozi_key

# 上传公钥到服务器
type $HOME\.ssh\mozi_key.pub | ssh root@你的IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# 测试免密登录
ssh -i $HOME\.ssh\mozi_key root@你的IP
```

---

## 🎯 第二部分：创建 GitHub 仓库（约 5 分钟）

### 步骤 1：在 GitHub 创建仓库

1. 访问 https://github.com/new
2. Repository name：`mozi-survey`（或任意名字）
3. 选择 **Private**（私有）
4. **不要**勾选 "Add a README"（我们本地已经有文件了）
5. 点 **Create repository**

### 步骤 2：在本地初始化 Git 并推送

打开 PowerShell，**进入项目目录**：

```powershell
cd D:\User\zp\Desktop\zp\阿党\问卷word

# 初始化
git init
git config user.name "你的名字"
git config user.email "你的邮箱"

# 添加文件（.gitignore 会自动排除敏感文件）
git add .

# 第一次提交
git commit -m "feat: 初始化 MOZI 问卷系统"

# 关联 GitHub（替换成你的仓库地址）
git remote add origin https://github.com/你的用户名/mozi-survey.git

# 推送
git branch -M main
git push -u origin main
```

> 💡 如果推送时弹出登录框，输入 GitHub 用户名和 Personal Access Token（不是密码）。Token 在 https://github.com/settings/tokens 生成。

### 步骤 3：确认推送成功

访问你的 GitHub 仓库页面，应该能看到这些文件：
- MOZI问卷.html
- server.js
- package.json
- ecosystem.config.js
- nginx.conf.example
- deploy.sh
- README.md
- .gitignore

---

## 🎯 第三部分：服务器拉取代码并部署（约 10 分钟）

### 步骤 1：在服务器上安装基础环境

```bash
# 安装 Node.js 20.x（如果上面 deploy.sh 没装）
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 验证
node -v   # 应显示 v20.x.x
npm -v
```

### 步骤 2：克隆代码到服务器

```bash
# 创建部署目录
mkdir -p /opt && cd /opt

# 克隆仓库（替换成你的仓库地址）
git clone https://github.com/你的用户名/mozi-survey.git mozi
cd mozi

# 安装依赖
npm install --production
```

### 步骤 3：安装并配置 PM2

```bash
# 全局安装
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 list
# 应该看到 mozi-survey 状态是 online

# 设置开机自启
pm2 startup systemd -u root --hp /root
# 会输出一行命令，复制执行（类似：sudo env PATH=...）

pm2 save
```

### 步骤 4：测试 Node.js 是否正常

```bash
# 在服务器上测试
curl http://localhost:3000/api/health
# 应返回 {"ok":true,"time":"..."}
```

### 步骤 5：安装并配置 Nginx

```bash
apt install -y nginx

# 复制配置文件
cp nginx.conf.example /etc/nginx/sites-available/mozi

# 编辑配置（如果你有域名，把 _ 改成 your-domain.com）
nano /etc/nginx/sites-available/mozi
# Ctrl+O 保存，Ctrl+X 退出

# 启用站点
ln -sf /etc/nginx/sites-available/mozi /etc/nginx/sites-enabled/mozi
rm -f /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 重载
systemctl reload nginx
```

### 步骤 6：访问测试

**在浏览器打开**：

- 有域名：`http://your-domain.com/MOZI问卷.html`
- 没域名（直接用 IP）：`http://你的服务器IP/MOZI问卷.html`

应该能看到问卷页面。在管理面板应显示「后端已连接」。

---

## 🎯 第四部分：配置 HTTPS（约 5 分钟，可选但推荐）

### 前置：准备好域名

1. 在阿里云/腾讯云买域名（.cn 首年 9 元，.com 55 元）
2. 解析域名到服务器公网 IP（A 记录）
3. 等 DNS 生效（通常几分钟到几小时）

### 安装 certbot

```bash
apt install -y certbot python3-certbot-nginx
```

### 申请 SSL 证书

```bash
# 替换成你的域名
certbot --nginx -d your-domain.com -d www.your-domain.com

# 按提示输入邮箱、同意条款（y y n）
```

certbot 会自动修改 Nginx 配置并重载服务。完成后 HTTPS 自动启用。

### 自动续期（certbot 已自动配置）

```bash
# 测试自动续期
certbot renew --dry-run
```

证书有效期 90 天，到期前会自动续。

---

## 🎯 第五部分：（可选）启用 API 鉴权

如果你部署到公网，担心数据被刷或被删，建议启用 API Key。

### 在服务器上设置环境变量

```bash
# 生成一个随机 key（也可以自己定）
export API_KEY="mozi_$(openssl rand -hex 16)"

# 写入 PM2 配置
cd /opt/mozi
nano ecosystem.config.js
```

把 `env` 部分改成：

```js
env: {
  NODE_ENV: 'production',
  PORT: 3000,
  API_KEY: 'mozi_你的密钥',  // ← 把上面生成的 key 粘贴进来
  TRUST_PROXY: '1'
}
```

### 重启生效

```bash
pm2 restart mozi-survey
```

### 在前端配置 API Key

打开 `MOZI问卷.html`，搜索 `API_BASE`，下面加一行：

```javascript
const API_BASE = '';  // 留空表示同源
const API_KEY = 'mozi_你的密钥';  // ← 和服务器一致
```

然后在所有 fetch 调用里加 header。**最简单的方式：**

1. 浏览器里按 F12 打开 DevTools
2. 在「问卷管理」标签，控制台执行：
   ```javascript
   localStorage.setItem('mozi_api_key', 'mozi_你的密钥');
   ```
3. 刷新页面

（如果你需要我把这个功能直接做进前端，告诉我，我加上）

---

## 🎯 第六部分：日常更新代码

### 步骤 1：在本地修改代码

修改 `MOZI问卷.html`、`server.js` 等文件后：

```powershell
cd D:\User\zp\Desktop\zp\阿党\问卷word
git add .
git commit -m "fix: 修了某个 bug"
git push
```

### 步骤 2：在服务器拉取并重启

```bash
ssh root@你的IP
cd /opt/mozi
git pull
npm install --production   # 如果改了 package.json
pm2 restart mozi-survey
```

可选：做成一行命令。编辑 `/usr/local/bin/update-mozi`：

```bash
nano /usr/local/bin/update-mozi
```

内容：

```bash
#!/bin/bash
cd /opt/mozi && git pull && pm2 restart mozi-survey
echo "✅ MOZI 已更新于 $(date)"
```

```bash
chmod +x /usr/local/bin/update-mozi
```

以后只需要在服务器执行：

```bash
update-mozi
```

---

## 🔧 常用运维命令

```bash
# 查看应用状态
pm2 list
pm2 info mozi-survey

# 查看日志
pm2 logs mozi-survey          # 实时
pm2 logs mozi-survey --lines 100 --nostream  # 最近 100 行

# 重启 / 停止 / 启动
pm2 restart mozi-survey
pm2 stop mozi-survey
pm2 start mozi-survey

# 查看 Nginx 状态
systemctl status nginx
systemctl restart nginx

# 查看 Nginx 日志
tail -f /var/log/nginx/mozi_access.log
tail -f /var/log/nginx/mozi_error.log

# 数据库备份
cp /opt/mozi/data/surveys.db /backup/surveys_$(date +%Y%m%d).db

# 查看磁盘占用
du -sh /opt/mozi/data
df -h
```

---

## ❓ 常见问题

### 启动报错：端口被占用

```bash
# 查看谁占用 3000
lsof -i :3000
# 杀掉
kill -9 PID

# 或者改端口
pm2 delete mozi-survey
PORT=3001 pm2 start ecosystem.config.js --update-env
# 然后改 Nginx 配置里的 proxy_pass 端口
```

### 浏览器打开后 API 连不上

1. 服务器本地测：`curl http://localhost:3000/api/health`
2. 检查 PM2 状态：`pm2 list`（应该是 online）
3. 检查 Nginx 状态：`systemctl status nginx`
4. 看错误日志：`pm2 logs mozi-survey --lines 50`

### Git 推送要密码

去 GitHub 设置 Personal Access Token（PAT），用 token 当密码。详细：https://docs.github.com/zh/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

### 80 端口访问不了

- 阿里云/腾讯云控制台 → 实例 → 安全组 → 添加规则：允许 80/443 端口
- 默认安全组通常只开放 22/3389

### 想要域名访问，但还没买

临时方案：用 IP 直连 `http://你的IP/MOZI问卷.html`，或者用 [nip.io](https://nip.io/) 这类服务（免费子域名）。

---

## 📊 服务器最低配置推荐

| 配置项 | 最低 | 推荐 |
|--------|------|------|
| CPU | 1核 | 2核 |
| 内存 | 2GB | 4GB |
| 带宽 | 1Mbps | 5Mbps |
| 系统盘 | 40GB | 60GB |

阿里云「轻量应用服务器」2核 2G 配置约 ¥60/月，新用户首年 ¥38 很有性价比。

---

## 💰 总成本估算

| 项目 | 一次性 | 每年 |
|------|--------|------|
| 轻量服务器（2核2G） | - | ¥300-700 |
| 域名（.com） | ¥55 | ¥55 |
| HTTPS 证书 | 免费（Let's Encrypt） | - |
| **合计** | - | **约 ¥400-800/年** |

完全够个人/小团队/课题组用。

---

## 🆘 需要更多帮助？

部署过程中任何一步卡住，把**报错信息**发给我，我帮你看。
