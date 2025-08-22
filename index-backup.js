const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// Enhanced CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Store active rooms
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Load comprehensive word list from JSON file
const fs = require('fs');
const path = require('path');

let words = [];
try {
  const wordsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'validWords.json'), 'utf8'));
  words = wordsData.words;
  console.log(`Loaded ${words.length} valid words from dictionary`);
} catch (error) {
  console.error('Error loading word dictionary, using fallback words:', error);
  // Fallback to basic words if JSON loading fails
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

// Validate custom word endpoint
app.post('/validate-word', (req, res) => {
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
    console.error('Error validating word:', error);
    res.status(500).json({ error: 'Failed to validate word' });
  }
});

app.post('/create-room', (req, res) => {
  console.log('Creating room with data:', req.body);
  
  try {
    const { username, mode = 'duel' } = req.body;
    
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    if (!['duel', 'battleRoyale'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid game mode' });
    }
    
    const code = generateRoomCode();
    
    console.log('Generated room code:', code, 'Mode:', mode);
    
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
      roundNumber: 1
    };
    
    rooms.set(code, room);
    console.log('Room created successfully:', room);
    console.log('Total rooms:', rooms.size);
    
    res.json({ code, mode });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.post('/join-room', (req, res) => {
  console.log('Joining room with data:', req.body);
  
  try {
    const { code, username } = req.body;
    
    if (!rooms.has(code)) {
      console.log('Room not found:', code);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = rooms.get(code);
    if (room.status !== 'waiting') {
      console.log('Game already in progress for room:', code);
      return res.status(400).json({ error: 'Game already in progress' });
    }
    
    const joinValidation = canJoinRoom(room, username);
    if (!joinValidation.canJoin) {
      console.log('Cannot join room:', joinValidation.reason);
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
    
    console.log('Player joined room:', { code, playerId, totalPlayers: room.players.length, mode: room.mode });
    
    res.json({ success: true, room });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Debug endpoint to see all rooms
app.get('/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values());
  res.json({ rooms: roomsList, total: rooms.size });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-room', ({ username, roomCode }) => {
    console.log('Socket join-room:', { username, roomCode, socketId: socket.id });
    socket.join(roomCode);
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      io.to(roomCode).emit('room-updated', room);
      console.log('Room updated emitted for:', roomCode);
    }
  });
  
  socket.on('start-game', ({ roomCode, customWord }) => {
    console.log('Starting game:', { roomCode, customWord });
    
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
      
      // Reset player states for new game
      room.players.forEach(player => {
        player.eliminated = false;
        player.guesses = [];
        player.won = false;
        player.score = 0;
      });
      
      console.log('Game started with word:', room.solutionWord, 'Mode:', room.mode);
      
      io.to(roomCode).emit('game-started', { 
        solutionWord: room.solutionWord,
        status: room.status,
        mode: room.mode,
        players: room.players
      });
    }
  });
  
  socket.on('submit-guess', ({ roomCode, username, guess, boardState, attemptNumber }) => {
    console.log('Guess submitted:', { roomCode, username, guess, attemptNumber });
    
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
            console.log('Duel game over! Winner:', username);
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
            console.log('Player eliminated in Battle Royale:', username);
            
            // Check if only one player remains
            const activePlayers = room.players.filter(p => !p.eliminated);
            if (activePlayers.length === 1) {
              // Last player standing
              const winner = activePlayers[0];
              winner.won = true;
              room.status = 'finished';
              console.log('Battle Royale game over! Winner:', winner.username);
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
        } else if (attemptNumber >= 6) {
          // Player ran out of attempts
          if (room.mode === 'duel') {
            // Duel mode: check if other player also failed
            const otherPlayer = room.players.find(p => p.username !== username);
            if (otherPlayer && otherPlayer.guesses && otherPlayer.guesses.length >= 6 && !otherPlayer.won) {
              // Both players failed - it's a draw
              room.status = 'finished';
              console.log('Duel game over! Draw - both players failed');
              io.to(roomCode).emit('game-over', {
                winner: null, // null indicates draw
                solutionWord: room.solutionWord,
                status: room.status,
                mode: room.mode,
                players: room.players
              });
            }
          } else {
            // Battle Royale mode: eliminate player
            player.eliminated = true;
            console.log('Player eliminated in Battle Royale (6 attempts):', username);
            
            // Check if only one player remains
            const activePlayers = room.players.filter(p => !p.eliminated);
            if (activePlayers.length === 1) {
              // Last player standing
              const winner = activePlayers[0];
              winner.won = true;
              room.status = 'finished';
              console.log('Battle Royale game over! Winner:', winner.username);
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
        
        // Emit updated board state for all players
        io.to(roomCode).emit('guess-submitted', {
          username,
          guess,
          boardState,
          attemptNumber,
          players: room.players
        });
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
  console.log(`Socket.IO available at http://localhost:${PORT}`);
});
