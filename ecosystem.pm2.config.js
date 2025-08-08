const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envConfig = dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'apex-backend',
      script: 'npm',
      args: 'run dev',
      cwd: __dirname,
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'development'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    },
    {
      name: 'apex-monitor',
      script: './run-monitor.sh',
      cwd: __dirname,
      interpreter: '/bin/bash',
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/monitor-error.log',
      out_file: './logs/monitor-out.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
}