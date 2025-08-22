require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

// Import utilities and middleware
const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const gameRoutes = require('./routes/game');

// Import Socket.IO handler
const GameHandler = require('./socket/gameHandler');

// Import room manager for cleanup
const roomManager = require('./utils/roomManager');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Environment configuration from config
const { NODE_ENV, PORT, HOST, CORS_ORIGIN } = config;

// Logger is now configured in utils/logger.js

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
  stream: logger.stream
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: require('./package.json').version
  });
});

// API versioning
app.use('/api/v1', (req, res, next) => {
  req.apiVersion = 'v1';
  next();
});

// Use game routes
app.use('/api/v1', gameRoutes);

// Game routes are now handled in routes/game.js

// Socket.IO configuration with production settings
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: config.SOCKET_PING_TIMEOUT,
  pingInterval: config.SOCKET_PING_INTERVAL,
  maxHttpBufferSize: config.SOCKET_MAX_HTTP_BUFFER_SIZE
});

// Add Socket.IO debug logging
io.engine.on('connection_error', (err) => {
  logger.error('Socket.IO connection error:', err);
});

io.on('connect_error', (err) => {
  logger.error('Socket.IO connect error:', err);
});

io.on('connect_timeout', (err) => {
  logger.error('Socket.IO connect timeout:', err);
});

// Initialize Socket.IO game handler
const gameHandler = new GameHandler(io);

// Use centralized error handling middleware
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    // Stop room cleanup interval
    roomManager.stopCleanupInterval();
    logger.info('Room cleanup stopped');
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    // Stop room cleanup interval
    roomManager.stopCleanupInterval();
    logger.info('Room cleanup stopped');
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, HOST, () => {
  logger.info(`🚀 Word Duel Server running in ${NODE_ENV} mode`);
  logger.info(`📍 Server running on ${HOST}:${PORT}`);
  logger.info(`🔌 Socket.IO available at http://${HOST}:${PORT}`);
  logger.info(`📊 Health check: http://${HOST}:${PORT}/health`);
  logger.info(`📚 Enhanced backend with modular architecture`);
  logger.info(`🏗️  Enhanced backend architecture with modular design`);
});
