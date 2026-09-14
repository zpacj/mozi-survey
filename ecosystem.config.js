/**
 * PM2 进程管理配置
 * 启动：pm2 start ecosystem.config.js
 * 查看：pm2 list / pm2 logs mozi-survey
 */
module.exports = {
  apps: [{
    name: 'mozi-survey',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    time: true
  }]
};
