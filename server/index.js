require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Configure Winston logger
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'word-duel-server' },
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
    ...(NODE_ENV === 'development' ? [new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })] : [])
  ]
});

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
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
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
  stream: {
    write: (message) => logger.info(message.trim())
  }
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

// Store active rooms
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Load comprehensive word list from JSON file
let words = [];
try {
  const wordsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'validWords.json'), 'utf8'));
  words = wordsData.words;
  logger.info(`Loaded ${words.length} valid words from dictionary`);
} catch (error) {
  logger.error('Error loading word dictionary, using fallback words:', error);
  words = ['HELLO', 'WORLD', 'GAMES', 'PLAYS', 'SMART', 'BRAIN', 'QUICK', 'FAST', 'SLOW', 'EASY'];
}

function getRandomWord() {
  return words[Math.floor(Math.random() * words.length)];
}

// Validate if a word is in the dictionary
function isValidWord(word) {
  return words.includes(word.toUpperCase());
}

// Validate room joining based on mode
function canJoinRoom(room, username) {
  if (room.mode === 'duel' && room.players.length >= 2) {
    return { canJoin: false, reason: 'Duel rooms are limited to 2 players' };
  }
  if (room.mode === 'battleRoyale' && room.players.length >= 8) {
    return { canJoin: false, reason: 'Battle Royale rooms are limited to 8 players' };
  }
  if (room.players.some(p => p.username === username)) {
    return { canJoin: false, reason: 'Username already taken in this room' };
  }
  return { canJoin: true };
}

// API Routes
app.post('/api/v1/validate-word', (req, res) => {
  try {
    const { word } = req.body;
    
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Word is required' });
    }
    
    const isValid = isValidWord(word);
    const suggestions = isValid ? [] : words
      .filter(w => w.startsWith(word.substring(0, 2).toUpperCase()) || w.includes(word.substring(0, 2).toUpperCase()))
      .slice(0, 5);
    
    res.json({
      isValid,
      suggestions,
      message: isValid ? 'Valid word!' : 'Word not in dictionary'
    });
  } catch (error) {
    logger.error('Error validating word:', error);
    res.status(500).json({ error: 'Failed to validate word' });
  }
});

app.post('/api/v1/create-room', (req, res) => {
  logger.info('Creating room with data:', req.body);
  
  try {
    const { username, mode = 'duel' } = req.body;
    
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    if (!['duel', 'battleRoyale'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid game mode' });
    }
    
    const code = generateRoomCode();
    
    logger.info('Generated room code:', code, 'Mode:', mode);
    
    const room = {
      code,
      hostId: username.trim(),
      players: [{ 
        id: username.trim(), 
        username: username.trim(), 
        score: 0, 
        eliminated: false,
        guesses: [],
        won: false
      }],
      solutionWord: '',
      status: 'waiting',
      mode: mode,
      maxPlayers: mode === 'duel' ? 2 : 8,
      gameStartTime: null,
      roundNumber: 1,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    rooms.set(code, room);
    logger.info('Room created successfully:', room);
    logger.info('Total rooms:', rooms.size);
    
    res.json({ code, mode });
  } catch (error) {
    logger.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.post('/api/v1/join-room', (req, res) => {
  logger.info('Joining room with data:', req.body);
  
  try {
    const { code, username } = req.body;
    
    if (!rooms.has(code)) {
      logger.info('Room not found:', code);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = rooms.get(code);
    if (room.status !== 'waiting') {
      logger.info('Game already in progress for room:', code);
      return res.status(400).json({ error: 'Game already in progress' });
    }
    
    const joinValidation = canJoinRoom(room, username);
    if (!joinValidation.canJoin) {
      logger.info('Cannot join room:', joinValidation.reason);
      return res.status(400).json({ error: joinValidation.reason });
    }
    
    const playerId = username || 'Anonymous';
    room.players.push({ 
      id: playerId, 
      username: playerId, 
      score: 0, 
      eliminated: false,
      guesses: [],
      won: false
    });
    
    room.lastActivity = new Date();
    
    logger.info('Player joined room:', { code, playerId, totalPlayers: room.players.length, mode: room.mode });
    
    res.json({ success: true, room });
  } catch (error) {
    logger.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Debug endpoint to see all rooms
app.get('/api/v1/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values());
  res.json({ 
    rooms: roomsList, 
    total: rooms.size,
    timestamp: new Date().toISOString()
  });
});

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
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('User connected:', socket.id);
  
  socket.on('join-room', ({ username, roomCode, socketId }) => {
    logger.info('Socket join-room:', { username, roomCode, socketId });
    
    if (rooms.has(roomCode)) {
      socket.join(roomCode);
      const room = rooms.get(roomCode);
      room.lastActivity = new Date();
      
      // Emit room updated event
      io.to(roomCode).emit('room-updated', room);
    }
  });
  
  socket.on('start-game', ({ roomCode, customWord }) => {
    logger.info('Starting game:', { roomCode, customWord });
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      
      // Validate minimum players for each mode
      if (room.mode === 'duel' && room.players.length < 2) {
        io.to(roomCode).emit('game-error', { message: 'Duel mode requires at least 2 players' });
        return;
      }
      
      if (room.mode === 'battleRoyale' && room.players.length < 2) {
        io.to(roomCode).emit('game-error', { message: 'Battle Royale mode requires at least 2 players' });
        return;
      }
      
      // Validate custom word if provided
      if (customWord && customWord.trim()) {
        const word = customWord.trim().toUpperCase();
        if (!isValidWord(word)) {
          io.to(roomCode).emit('game-error', { message: 'Invalid word. Please choose a valid 5-letter word.' });
          return;
        }
        room.solutionWord = word;
      } else {
        room.solutionWord = getRandomWord();
      }
      
      room.status = 'playing';
      room.gameStartTime = new Date();
      room.roundNumber = 1;
      room.lastActivity = new Date();
      
      // Reset player states for new game
      room.players.forEach(player => {
        player.eliminated = false;
        player.guesses = [];
        player.won = false;
        player.score = 0;
      });
      
      logger.info('Game started with word:', room.solutionWord, 'Mode:', room.mode);
      
      io.to(roomCode).emit('game-started', { 
        solutionWord: room.solutionWord,
        status: room.status,
        mode: room.mode,
        players: room.players
      });
    }
  });
  
  socket.on('submit-guess', ({ roomCode, username, guess, boardState, attemptNumber }) => {
    logger.info('Guess submitted:', { roomCode, username, guess, attemptNumber });
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      const player = room.players.find(p => p.username === username);
      
      if (!player || player.eliminated) {
        return; // Player already eliminated
      }
      
      // Validate guess (basic validation)
      if (guess.length === 5 && /^[A-Z]+$/.test(guess)) {
        // Store the guess
        if (!player.guesses) player.guesses = [];
        player.guesses.push({ word: guess, attempt: attemptNumber });
        
        // Check if player won
        if (guess === room.solutionWord) {
          player.won = true;
          player.score = attemptNumber; // Lower score = better (fewer attempts)
          
          if (room.mode === 'duel') {
            // Duel mode: game ends immediately
            room.status = 'finished';
            logger.info('Duel game over! Winner:', username);
            io.to(roomCode).emit('game-over', {
              winner: username,
              solutionWord: room.solutionWord,
              status: room.status,
              mode: room.mode,
              players: room.players
            });
          } else {
            // Battle Royale mode: player is eliminated, others continue
            player.eliminated = true;
            logger.info('Player eliminated in Battle Royale:', username);
            
            // Check if only one player remains
            const activePlayers = room.players.filter(p => !p.eliminated);
            if (activePlayers.length === 1) {
              // Last player standing
              const winner = activePlayers[0];
              winner.won = true;
              room.status = 'finished';
              logger.info('Battle Royale game over! Winner:', winner.username);
              io.to(roomCode).emit('game-over', {
                winner: winner.username,
                solutionWord: room.solutionWord,
                status: room.status,
                mode: room.mode,
                players: room.players
              });
            } else {
              // Continue game, emit updated player state
              io.to(roomCode).emit('player-eliminated', {
                eliminatedPlayer: username,
                remainingPlayers: activePlayers.length,
                players: room.players
              });
            }
          }
        } else {
          // Player didn't win, check if they're out of attempts
          if (player.guesses.length >= 6) {
            if (room.mode === 'duel') {
              // Duel mode: check if both players failed
              const otherPlayer = room.players.find(p => p.username !== username);
              if (otherPlayer && otherPlayer.guesses && otherPlayer.guesses.length >= 6) {
                // Both players failed - it's a draw
                room.status = 'finished';
                logger.info('Duel game over! Draw - both players failed');
                io.to(roomCode).emit('game-over', {
                  winner: null, // null indicates draw
                  solutionWord: room.solutionWord,
                  status: room.status,
                  mode: room.mode,
                  players: room.players
                });
              }
            } else {
              // Battle Royale mode: player is eliminated
              player.eliminated = true;
              logger.info('Player eliminated in Battle Royale (out of attempts):', username);
              
              const activePlayers = room.players.filter(p => !p.eliminated);
              if (activePlayers.length === 1) {
                // Last player standing
                const winner = activePlayers[0];
                winner.won = true;
                room.status = 'finished';
                logger.info('Battle Royale game over! Winner:', winner.username);
                io.to(roomCode).emit('game-over', {
                  winner: winner.username,
                  solutionWord: room.solutionWord,
                  status: room.status,
                  mode: room.mode,
                  players: room.players
                });
              } else {
                // Continue game
                io.to(roomCode).emit('player-eliminated', {
                  eliminatedPlayer: username,
                  remainingPlayers: activePlayers.length,
                  players: room.players
                });
              }
            }
          }
        }
        
        // Emit guess submitted event with updated players
        io.to(roomCode).emit('guess-submitted', {
          username,
          guess,
          attemptNumber: player.guesses.length,
          players: room.players
        });
      }
    }
  });
  
  socket.on('disconnect', () => {
    logger.info('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
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
  logger.info(`📚 Loaded ${words.length} valid words from dictionary`);
});
