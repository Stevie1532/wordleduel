require('dotenv').config();

const config = {
  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3001,
  HOST: process.env.HOST || '0.0.0.0',
  
  // CORS Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://word-duel-two.vercel.app,https://*.up.railway.app',
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  
  // Game Configuration
  MAX_ROOM_AGE_HOURS: parseInt(process.env.MAX_ROOM_AGE_HOURS) || 24,
  CLEANUP_INTERVAL_MS: parseInt(process.env.CLEANUP_INTERVAL_MS) || 5 * 60 * 1000, // 5 minutes
  
  // Validation
  MIN_USERNAME_LENGTH: 2,
  MAX_USERNAME_LENGTH: 20,
  MAX_CUSTOM_WORD_LENGTH: 5,
  
  // Game Rules
  MAX_GUESSES: 6,
  WORD_LENGTH: 5,
  
  // Room Limits
  DUEL_MAX_PLAYERS: 2,
  BATTLE_ROYALE_MAX_PLAYERS: 8,
  
  // Socket.IO Configuration
  SOCKET_PING_TIMEOUT: 60000,
  SOCKET_PING_INTERVAL: 25000,
  SOCKET_MAX_HTTP_BUFFER_SIZE: 1e6
};

module.exports = config;
