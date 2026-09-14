#!/bin/bash
# ============================================
# MOZI 问卷系统 - 服务器一键部署脚本
# 适用：Ubuntu 22.04 / Debian 11+
# 用法：bash deploy.sh
# ============================================

set -e

echo "=========================================="
echo "  MOZI 问卷系统一键部署脚本"
echo "=========================================="
echo ""

# 1. 检查系统
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ 请使用 root 用户运行：sudo bash deploy.sh"
  exit 1
fi

# 2. 安装 Node.js（如果没装）
if ! command -v node &> /dev/null; then
  echo "📦 安装 Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"

# 3. 安装 PM2
if ! command -v pm2 &> /dev/null; then
  echo "📦 安装 PM2..."
  npm install -g pm2
fi
echo "✅ PM2: $(pm2 -v)"

# 4. 安装 Nginx
if ! command -v nginx &> /dev/null; then
  echo "📦 安装 Nginx..."
  apt-get install -y nginx
fi
echo "✅ Nginx: $(nginx -v 2>&1)"

# 5. 创建应用目录
APP_DIR="/opt/mozi"
if [ ! -d "$APP_DIR" ]; then
  echo "📁 创建应用目录：$APP_DIR"
  mkdir -p $APP_DIR
fi

# 6. 复制文件（如果在脚本所在目录运行）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📋 复制应用文件到 $APP_DIR..."
cp -r $SCRIPT_DIR/* $APP_DIR/ 2>/dev/null || true
# 排除敏感/无用文件
rm -f $APP_DIR/.gitignore
mkdir -p $APP_DIR/data $APP_DIR/logs

# 7. 安装依赖
cd $APP_DIR
if [ ! -d "node_modules" ]; then
  echo "📦 安装 npm 依赖..."
  npm install --production
fi

# 8. 用 PM2 启动
echo "🚀 启动应用（PM2）..."
pm2 delete mozi-survey 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 9. 配置开机自启
echo "⚙️  配置 PM2 开机自启..."
pm2 startup systemd -u root --hp /root | grep "sudo env" | bash || true

# 10. 配置 Nginx
echo "🌐 配置 Nginx..."
if [ -f "$SCRIPT_DIR/nginx.conf.example" ]; then
  cp $SCRIPT_DIR/nginx.conf.example /etc/nginx/sites-available/mozi
  # 替换默认 server_name
  sed -i 's/your-domain.com/_/g' /etc/nginx/sites-available/mozi
  ln -sf /etc/nginx/sites-available/mozi /etc/nginx/sites-enabled/mozi
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "✅ Nginx 已配置（HTTP 模式，无域名可直接访问）"
else
  echo "⚠️  未找到 nginx.conf.example，跳过 Nginx 配置"
fi

# 11. 开放防火墙（如果使用 ufw）
if command -v ufw &> /dev/null; then
  echo "🔥 配置防火墙..."
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ufw allow OpenSSH 2>/dev/null || true
fi

# 12. 显示结果
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "your-server-ip")
echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo ""
echo "📊 访问地址："
echo "   http://$SERVER_IP/MOZI问卷.html"
echo ""
echo "🔧 常用命令："
echo "   pm2 list              查看应用状态"
echo "   pm2 logs mozi-survey  查看实时日志"
echo "   pm2 restart mozi-survey  重启应用"
echo "   pm2 stop mozi-survey  停止应用"
echo ""
echo "📂 数据目录：$APP_DIR/data"
echo "📋 日志目录：$APP_DIR/logs"
echo ""
echo "💡 提示：首次访问可能需要等几秒钟让 Node.js 启动"
echo ""
