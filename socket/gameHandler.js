const logger = require('../utils/logger');
const roomManager = require('../utils/roomManager');
const wordValidator = require('../utils/wordValidator');
const config = require('../config');

class GameHandler {
  constructor(io) {
    this.io = io;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.logGameEvent('socket_connected', { socketId: socket.id });
      logger.info(`🔌 New socket connection: ${socket.id} from ${socket.handshake.address}`);
      
      // Log connection details for debugging
      logger.info(`📡 Socket transport: ${socket.conn.transport.name}`);
      logger.info(`🌐 Socket headers:`, socket.handshake.headers);
      
      // Join room
      socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
      
      // Start game
      socket.on('start-game', (data) => this.handleStartGame(socket, data));
      
      // Submit guess
      socket.on('submit-guess', (data) => this.handleSubmitGuess(socket, data));
      
      // Player disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket));
      
      // Leave room
      socket.on('leave-room', (data) => this.handleLeaveRoom(socket, data));
      
      // Get room status
      socket.on('get-room-status', (data) => this.handleGetRoomStatus(socket, data));
    });
  }

  handleJoinRoom(socket, { username, roomCode, socketId }) {
    try {
      logger.logGameEvent('socket_join_room', { username, roomCode, socketId });
      
      if (!roomManager.roomExists(roomCode)) {
        socket.emit('room-error', { message: 'Room not found' });
        return;
      }

      const room = roomManager.getRoom(roomCode);
      if (room.status !== 'waiting') {
        socket.emit('room-error', { message: 'Game already in progress' });
        return;
      }

      socket.join(roomCode);
      room.lastActivity = new Date();
      
      // Emit room updated event
      this.io.to(roomCode).emit('room-updated', room);
      
      logger.logGameEvent('socket_joined_room', { username, roomCode, socketId });
      
    } catch (error) {
      logger.logError(error, { username, roomCode, socketId });
      socket.emit('room-error', { message: 'Failed to join room' });
    }
  }

  handleStartGame(socket, { roomCode, customWord }) {
    try {
      logger.logGameEvent('start_game_requested', { roomCode, customWord });
      
      if (!roomManager.roomExists(roomCode)) {
        socket.emit('game-error', { message: 'Room not found' });
        return;
      }

      const room = roomManager.getRoom(roomCode);
      
      // Validate minimum players for each mode
      if (room.mode === 'duel' && room.players.length < 2) {
        socket.emit('game-error', { message: 'Duel mode requires at least 2 players' });
        return;
      }
      
      if (room.mode === 'battleRoyale' && room.players.length < 2) {
        socket.emit('game-error', { message: 'Battle Royale mode requires at least 2 players' });
        return;
      }
      
      // Validate custom word if provided
      if (customWord && customWord.trim()) {
        const word = customWord.trim().toUpperCase();
        if (!wordValidator.isValidWord(word)) {
          socket.emit('game-error', { message: 'Invalid word. Please choose a valid 5-letter word.' });
          return;
        }
      }

      // Start the game
      const updatedRoom = roomManager.startGame(roomCode, customWord);
      
      logger.logGameEvent('game_started', { 
        roomCode, 
        customWord: !!customWord,
        playerCount: updatedRoom.players.length,
        mode: updatedRoom.mode 
      });
      
      // Emit game started event
      this.io.to(roomCode).emit('game-started', { 
        solutionWord: updatedRoom.solutionWord,
        status: updatedRoom.status,
        mode: updatedRoom.mode,
        players: updatedRoom.players,
        settings: updatedRoom.settings
      });
      
    } catch (error) {
      logger.logError(error, { roomCode, customWord });
      socket.emit('game-error', { message: 'Failed to start game' });
    }
  }

  handleSubmitGuess(socket, { roomCode, username, guess, boardState, attemptNumber }) {
    try {
      logger.logGameEvent('guess_submitted', { roomCode, username, guess, attemptNumber });
      
      if (!roomManager.roomExists(roomCode)) {
        socket.emit('game-error', { message: 'Room not found' });
        return;
      }

      const room = roomManager.getRoom(roomCode);
      const player = room.players.find(p => p.username === username);
      
      if (!player || player.eliminated) {
        return; // Player already eliminated
      }

      // Validate guess
      if (!wordValidator.isValidWordFormat(guess)) {
        socket.emit('game-error', { message: 'Invalid guess format' });
        return;
      }

      // Submit the guess
      const result = roomManager.submitGuess(roomCode, username, guess, attemptNumber);
      
      if (result.won) {
        // Player won
        if (room.mode === 'duel') {
          // Duel mode: game ends immediately
          room.status = 'finished';
          logger.logGameEvent('duel_game_over', { roomCode, winner: username });
          
          this.io.to(roomCode).emit('game-over', {
            winner: username,
            solutionWord: room.solutionWord,
            status: room.status,
            mode: room.mode,
            players: room.players
          });
        } else {
          // Battle Royale mode: player is eliminated, others continue
          logger.logGameEvent('player_won_battle_royale', { roomCode, username });
          
          // Check if only one player remains
          const activePlayers = room.players.filter(p => !p.eliminated);
          if (activePlayers.length === 1) {
            // Last player standing
            const winner = activePlayers[0];
            room.status = 'finished';
            logger.logGameEvent('battle_royale_game_over', { roomCode, winner: winner.username });
            
            this.io.to(roomCode).emit('game-over', {
              winner: winner.username,
              solutionWord: room.solutionWord,
              status: room.status,
              mode: room.mode,
              players: room.players
            });
          } else {
            // Continue game, emit updated player state
            this.io.to(roomCode).emit('player-eliminated', {
              eliminatedPlayer: username,
              remainingPlayers: activePlayers.length,
              players: room.players
            });
          }
        }
      } else if (result.eliminated) {
        // Player is out of attempts
        if (room.mode === 'duel') {
          // Check if both players failed
          const otherPlayer = room.players.find(p => p.username !== username);
          if (otherPlayer && otherPlayer.guesses && otherPlayer.guesses.length >= config.MAX_GUESSES) {
            // Both players failed - it's a draw
            room.status = 'finished';
            logger.logGameEvent('duel_game_over_draw', { roomCode });
            
            this.io.to(roomCode).emit('game-over', {
              winner: null, // null indicates draw
              solutionWord: room.solutionWord,
              status: room.status,
              mode: room.mode,
              players: room.players
            });
          }
        } else {
          // Battle Royale mode: check if game should end
          const activePlayers = room.players.filter(p => !p.eliminated);
          if (activePlayers.length === 1) {
            // Last player standing
            const winner = activePlayers[0];
            room.status = 'finished';
            logger.logGameEvent('battle_royale_game_over_last_standing', { roomCode, winner: winner.username });
            
            this.io.to(roomCode).emit('game-over', {
              winner: winner.username,
              solutionWord: room.solutionWord,
              status: room.status,
              mode: room.mode,
              players: room.players
            });
          } else {
            // Continue game
            this.io.to(roomCode).emit('player-eliminated', {
              eliminatedPlayer: username,
              remainingPlayers: activePlayers.length,
              players: room.players
            });
          }
        }
      }

      // Emit guess submitted event with updated players
      this.io.to(roomCode).emit('guess-submitted', {
        username,
        guess,
        attemptNumber: result.player.guesses.length,
        players: room.players,
        won: result.won,
        eliminated: result.eliminated
      });
      
    } catch (error) {
      logger.logError(error, { roomCode, username, guess, attemptNumber });
      socket.emit('game-error', { message: 'Failed to submit guess' });
    }
  }

  handleLeaveRoom(socket, { roomCode, username }) {
    try {
      logger.logGameEvent('player_leaving_room', { roomCode, username });
      
      if (roomManager.roomExists(roomCode)) {
        const removed = roomManager.removePlayerFromRoom(roomCode, username);
        if (removed) {
          socket.leave(roomCode);
          
          const room = roomManager.getRoom(roomCode);
          if (room) {
            // Emit room updated event
            this.io.to(roomCode).emit('room-updated', room);
          }
          
          logger.logGameEvent('player_left_room', { roomCode, username });
        }
      }
      
    } catch (error) {
      logger.logError(error, { roomCode, username });
    }
  }

  handleGetRoomStatus(socket, { roomCode }) {
    try {
      if (!roomManager.roomExists(roomCode)) {
        socket.emit('room-error', { message: 'Room not found' });
        return;
      }

      const room = roomManager.getRoom(roomCode);
      const stats = roomManager.getRoomStats(roomCode);
      
      socket.emit('room-status', {
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
        },
        stats
      });
      
    } catch (error) {
      logger.logError(error, { roomCode });
      socket.emit('room-error', { message: 'Failed to get room status' });
    }
  }

  handleDisconnect(socket) {
    logger.logGameEvent('socket_disconnected', { socketId: socket.id });
    
    // Find all rooms this socket is in and remove the player
    const rooms = Array.from(socket.rooms);
    rooms.forEach(roomCode => {
      if (roomCode !== socket.id) { // socket.id is always in socket.rooms
        // Note: We can't determine which username this socket was associated with
        // In a production app, you'd want to maintain a socket-to-user mapping
        logger.logGameEvent('socket_disconnected_from_room', { 
          socketId: socket.id, 
          roomCode 
        });
      }
    });
  }

  // Broadcast to all clients in a room
  broadcastToRoom(roomCode, event, data) {
    this.io.to(roomCode).emit(event, data);
  }

  // Broadcast to all clients
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  // Get connected clients count
  getConnectedClientsCount() {
    return this.io.engine.clientsCount;
  }

  // Get room clients count
  getRoomClientsCount(roomCode) {
    const room = this.io.sockets.adapter.rooms.get(roomCode);
    return room ? room.size : 0;
  }
}

module.exports = GameHandler;
