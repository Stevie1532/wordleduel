const express = require('express');
const { validationRules, handleValidationErrors } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const roomManager = require('../utils/roomManager');
const wordValidator = require('../utils/wordValidator');
const logger = require('../utils/logger');

const router = express.Router();

// Validate word endpoint
router.post('/validate-word', 
  validationRules.validateWord,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { word } = req.body;
    
    const isValid = wordValidator.isValidWord(word);
    const suggestions = isValid ? [] : wordValidator.getSuggestions(word, 5);
    
    logger.logGameEvent('word_validated', { 
      word, 
      isValid, 
      suggestionsCount: suggestions.length 
    });
    
    res.json({
      isValid,
      suggestions,
      message: isValid ? 'Valid word!' : 'Word not in dictionary',
      difficulty: isValid ? wordValidator.getWordDifficulty(word) : null
    });
  })
);

// Create room endpoint
router.post('/create-room',
  validationRules.createRoom,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { username, mode = 'duel' } = req.body;
    
    logger.logGameEvent('room_creation_requested', { username, mode });
    
    const room = roomManager.createRoom(username, mode);
    
    logger.logGameEvent('room_created', { 
      roomCode: room.code, 
      username, 
      mode 
    });
    
    res.json({ 
      code: room.code, 
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      settings: room.settings
    });
  })
);

// Join room endpoint
router.post('/join-room',
  validationRules.joinRoom,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { code, username } = req.body;
    
    logger.logGameEvent('room_join_requested', { roomCode: code, username });
    
    const room = roomManager.addPlayerToRoom(code, username);
    
    logger.logGameEvent('player_joined_room', { 
      roomCode: code, 
      username,
      totalPlayers: room.players.length 
    });
    
    res.json({ 
      success: true, 
      room: {
        code: room.code,
        mode: room.mode,
        status: room.status,
        players: room.players.map(p => ({
          username: p.username,
          score: p.score,
          eliminated: p.eliminated,
          won: p.won
        })),
        maxPlayers: room.maxPlayers,
        hostId: room.hostId
      }
    });
  })
);

// Get room info endpoint
router.get('/room/:code', asyncHandler(async (req, res) => {
  const { code } = req.params;
  
  const room = roomManager.getRoom(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const roomStats = roomManager.getRoomStats(code);
  
  res.json({
    room: {
      code: room.code,
      mode: room.mode,
      status: room.status,
      players: room.players.map(p => ({
        username: p.username,
        score: p.score,
        eliminated: p.eliminated,
        won: p.won,
        joinedAt: p.joinedAt
      })),
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    },
    stats: roomStats
  });
}));

// Get all rooms (debug endpoint)
router.get('/rooms', asyncHandler(async (req, res) => {
  const rooms = roomManager.getAllRooms();
  const stats = {
    total: roomManager.getTotalRoomCount(),
    active: roomManager.getActiveRoomCount(),
    waiting: rooms.filter(r => r.status === 'waiting').length,
    playing: rooms.filter(r => r.status === 'playing').length,
    finished: rooms.filter(r => r.status === 'finished').length
  };
  
  res.json({ 
    rooms: rooms.map(room => ({
      code: room.code,
      mode: room.mode,
      status: room.status,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    })), 
    stats,
    timestamp: new Date().toISOString()
  });
}));

// Get word statistics
router.get('/words/stats', asyncHandler(async (req, res) => {
  const stats = wordValidator.getWordStats();
  
  res.json({
    stats,
    timestamp: new Date().toISOString()
  });
}));

// Get words by difficulty
router.get('/words/difficulty/:level', asyncHandler(async (req, res) => {
  const { level } = req.params;
  const difficulty = parseInt(level);
  
  if (isNaN(difficulty) || difficulty < 1 || difficulty > 3) {
    return res.status(400).json({ error: 'Difficulty level must be 1, 2, or 3' });
  }
  
  const words = wordValidator.getWordsByDifficulty(difficulty);
  
  res.json({
    difficulty: level,
    count: words.length,
    words: words.slice(0, 50), // Limit to 50 words for response size
    timestamp: new Date().toISOString()
  });
}));

// Search words with pattern
router.get('/words/search', asyncHandler(async (req, res) => {
  const { pattern, maxResults = 10 } = req.query;
  
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern parameter is required' });
  }
  
  const words = wordValidator.searchWords(pattern, parseInt(maxResults));
  
  res.json({
    pattern,
    count: words.length,
    words,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
