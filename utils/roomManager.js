const logger = require('./logger');
const config = require('../config');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.cleanupInterval = null;
    this.startCleanupInterval();
  }

  // Generate a unique room code
  generateRoomCode() {
    let code;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      attempts++;
      
      if (attempts > maxAttempts) {
        throw new Error('Unable to generate unique room code');
      }
    } while (this.rooms.has(code));

    return code;
  }

  // Create a new room
  createRoom(username, mode = 'duel') {
    const code = this.generateRoomCode();
    
    const room = {
      code,
      hostId: username,
      players: [{ 
        id: username, 
        username: username, 
        score: 0, 
        eliminated: false,
        guesses: [],
        won: false,
        joinedAt: new Date()
      }],
      solutionWord: '',
      status: 'waiting',
      mode: mode,
      maxPlayers: mode === 'duel' ? config.DUEL_MAX_PLAYERS : config.BATTLE_ROYALE_MAX_PLAYERS,
      gameStartTime: null,
      roundNumber: 1,
      createdAt: new Date(),
      lastActivity: new Date(),
      settings: {
        allowCustomWords: true,
        maxGuesses: config.MAX_GUESSES,
        wordLength: config.WORD_LENGTH
      }
    };
    
    this.rooms.set(code, room);
    logger.logRoomEvent('room_created', code, { username, mode });
    
    return room;
  }

  // Get room by code
  getRoom(code) {
    return this.rooms.get(code);
  }

  // Check if room exists
  roomExists(code) {
    return this.rooms.has(code);
  }

  // Add player to room
  addPlayerToRoom(code, username) {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.status !== 'waiting') {
      throw new Error('Game already in progress');
    }

    if (room.players.length >= room.maxPlayers) {
      throw new Error(`Room is full (${room.maxPlayers} players max)`);
    }

    if (room.players.some(p => p.username === username)) {
      throw new Error('Username already taken in this room');
    }

    const player = {
      id: username,
      username: username,
      score: 0,
      eliminated: false,
      guesses: [],
      won: false,
      joinedAt: new Date()
    };

    room.players.push(player);
    room.lastActivity = new Date();
    
    logger.logRoomEvent('player_joined', code, { username, totalPlayers: room.players.length });
    
    return room;
  }

  // Remove player from room
  removePlayerFromRoom(code, username) {
    const room = this.rooms.get(code);
    if (!room) return false;

    const playerIndex = room.players.findIndex(p => p.username === username);
    if (playerIndex === -1) return false;

    room.players.splice(playerIndex, 1);
    room.lastActivity = new Date();

    // If no players left, delete the room
    if (room.players.length === 0) {
      this.deleteRoom(code);
      logger.logRoomEvent('room_deleted_empty', code, { reason: 'no_players_left' });
    } else {
      // If host left, assign new host
      if (room.hostId === username) {
        room.hostId = room.players[0].username;
        logger.logRoomEvent('host_changed', code, { newHost: room.hostId });
      }
      
      logger.logRoomEvent('player_left', code, { username, remainingPlayers: room.players.length });
    }

    return true;
  }

  // Start game in room
  startGame(code, customWord = null) {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.status !== 'waiting') {
      throw new Error('Game already in progress');
    }

    if (room.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    // Set solution word
    if (customWord && customWord.trim()) {
      room.solutionWord = customWord.trim().toUpperCase();
    } else {
      room.solutionWord = this.getRandomWord();
    }

    // Reset player states
    room.players.forEach(player => {
      player.eliminated = false;
      player.guesses = [];
      player.won = false;
      player.score = 0;
    });

    room.status = 'playing';
    room.gameStartTime = new Date();
    room.roundNumber = 1;
    room.lastActivity = new Date();

    logger.logRoomEvent('game_started', code, { 
      customWord: !!customWord, 
      playerCount: room.players.length,
      mode: room.mode 
    });

    return room;
  }

  // Submit guess for a player
  submitGuess(code, username, guess, attemptNumber) {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error('Room not found');
    }

    const player = room.players.find(p => p.username === username);
    if (!player || player.eliminated) {
      throw new Error('Player not found or already eliminated');
    }

    // Validate guess
    if (guess.length !== config.WORD_LENGTH || !/^[A-Z]+$/.test(guess)) {
      throw new Error(`Guess must be exactly ${config.WORD_LENGTH} letters`);
    }

    // Store guess
    if (!player.guesses) player.guesses = [];
    player.guesses.push({ 
      word: guess, 
      attempt: attemptNumber,
      timestamp: new Date()
    });

    // Check if player won
    if (guess === room.solutionWord) {
      player.won = true;
      player.score = attemptNumber;
      
      logger.logGameEvent('player_won', { 
        roomCode: code, 
        username, 
        attempts: attemptNumber 
      });

      return { won: true, player, room };
    }

    // Check if player is out of attempts
    if (player.guesses.length >= config.MAX_GUESSES) {
      player.eliminated = true;
      
      logger.logGameEvent('player_eliminated', { 
        roomCode: code, 
        username, 
        reason: 'out_of_attempts' 
      });

      return { eliminated: true, player, room };
    }

    return { continue: true, player, room };
  }

  // Get random word from dictionary
  getRandomWord() {
    // This would typically load from a word list
    // For now, return a placeholder
    const fallbackWords = ['HELLO', 'WORLD', 'GAMES', 'PLAYS', 'SMART'];
    return fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
  }

  // Get all rooms (for debugging/admin)
  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  // Get room statistics
  getRoomStats(code) {
    const room = this.rooms.get(code);
    if (!room) return null;

    return {
      code: room.code,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status,
      mode: room.mode,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      gameStartTime: room.gameStartTime,
      activePlayers: room.players.filter(p => !p.eliminated).length,
      eliminatedPlayers: room.players.filter(p => p.eliminated).length
    };
  }

  // Delete a room
  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (room) {
      logger.logRoomEvent('room_deleted', code, { 
        reason: 'manual_deletion',
        playerCount: room.players.length 
      });
    }
    return this.rooms.delete(code);
  }

  // Clean up old rooms
  cleanupOldRooms() {
    const now = new Date();
    const maxAge = config.MAX_ROOM_AGE_HOURS * 60 * 60 * 1000; // Convert to milliseconds
    
    let cleanedCount = 0;
    
    for (const [code, room] of this.rooms.entries()) {
      const roomAge = now - room.createdAt;
      
      if (roomAge > maxAge) {
        this.deleteRoom(code);
        cleanedCount++;
        logger.logRoomEvent('room_cleaned_up', code, { 
          reason: 'expired',
          age: Math.round(roomAge / (60 * 60 * 1000)) + ' hours'
        });
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired rooms`);
    }
  }

  // Start cleanup interval
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRooms();
    }, config.CLEANUP_INTERVAL_MS);
    
    logger.info(`Room cleanup interval started (${config.CLEANUP_INTERVAL_MS}ms)`);
  }

  // Stop cleanup interval
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Room cleanup interval stopped');
    }
  }

  // Get total room count
  getTotalRoomCount() {
    return this.rooms.size;
  }

  // Get active room count (rooms with players)
  getActiveRoomCount() {
    return Array.from(this.rooms.values()).filter(room => room.players.length > 0).length;
  }
}

module.exports = new RoomManager();
