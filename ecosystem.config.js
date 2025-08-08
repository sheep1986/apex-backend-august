module.exports = {
  apps: [
    {
      name: 'apex-monitor',
      script: 'node',
      args: 'api/test-automation-check.js',
      cwd: '/Users/seanwentz/Desktop/Apex/apps/backend',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      max_memory_restart: '500M',
      error_file: 'logs/monitor-error.log',
      out_file: 'logs/monitor-out.log',
      time: true,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100
    }
  ]
}