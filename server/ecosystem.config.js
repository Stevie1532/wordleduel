module.exports = {
  apps: [
    {
      name: 'word-duel-server',
      script: 'index.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '0.0.0.0',
        CORS_ORIGIN: 'https://yourdomain.com',
        LOG_LEVEL: 'info',
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX_REQUESTS: 100
      },
      // Process management
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Monitoring
      pmx: true,
      monitor: false,
      
      // Auto restart
      autorestart: true,
      restart_delay: 4000,
      
      // Health check
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // Environment variables
      env_file: '.env',
      
      // Advanced settings
      node_args: '--max-old-space-size=1024',
      instances: 1, // Start with 1, can be scaled
      exec_mode: 'fork' // Use fork mode for better stability
    }
  ],
  
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/word-duel.git',
      path: '/var/www/word-duel',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
