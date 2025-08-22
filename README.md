# Word Duel Server

A robust, production-ready Express.js backend for the Word Duel multiplayer game.

## 🚀 Features

- **Real-time Multiplayer Gaming** - Socket.IO powered real-time communication
- **Multiple Game Modes** - Duel (1v1) and Battle Royale (up to 8 players)
- **Comprehensive Word Validation** - Built-in dictionary with difficulty ratings
- **Room Management** - Create, join, and manage game rooms
- **Security & Performance** - Rate limiting, CORS, compression, and security headers
- **Structured Logging** - Winston-based logging with file rotation
- **Input Validation** - Express-validator with custom validation rules
- **Error Handling** - Centralized error handling with custom error classes
- **Auto-cleanup** - Automatic cleanup of old/inactive rooms
- **Docker Support** - Ready for containerization

## 🏗️ Architecture

```
server/
├── config.js              # Centralized configuration
├── index.js               # Main server entry point
├── middleware/            # Express middleware
│   ├── validation.js      # Input validation rules
│   └── errorHandler.js    # Error handling middleware
├── routes/                # API route handlers
│   └── game.js           # Game-related endpoints
├── socket/                # Socket.IO handlers
│   └── gameHandler.js    # Real-time game logic
├── utils/                 # Utility modules
│   ├── logger.js         # Winston logging setup
│   ├── roomManager.js    # Room management logic
│   └── wordValidator.js  # Word validation and suggestions
├── validWords.json        # Word dictionary
├── package.json           # Dependencies and scripts
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose setup
└── ecosystem.config.js   # PM2 process manager config
```

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wordleduel/server
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Environment setup**
   ```bash
   # Copy and modify environment variables
   cp .env.example .env
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOG_LEVEL` | `info` | Logging level |
| `MAX_ROOM_AGE_HOURS` | `24` | Maximum room age before cleanup |
| `CLEANUP_INTERVAL_MS` | `300000` | Room cleanup interval (5 min) |

### Game Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `MAX_GUESSES` | `6` | Maximum attempts per player |
| `WORD_LENGTH` | `5` | Length of solution words |
| `DUEL_MAX_PLAYERS` | `2` | Maximum players in duel mode |
| `BATTLE_ROYALE_MAX_PLAYERS` | `8` | Maximum players in battle royale |

## 📡 API Endpoints

### Game Routes (`/api/v1`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/validate-word` | Validate a word against dictionary |
| `POST` | `/create-room` | Create a new game room |
| `POST` | `/join-room` | Join an existing room |
| `GET` | `/room/:code` | Get room information |
| `GET` | `/rooms` | List all rooms (debug) |
| `GET` | `/words/stats` | Get word dictionary statistics |
| `GET` | `/words/difficulty/:level` | Get words by difficulty level |
| `GET` | `/words/search` | Search words with pattern matching |

### Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join-room` | Client → Server | Join a game room |
| `leave-room` | Client → Server | Leave a game room |
| `start-game` | Client → Server | Start the game |
| `submit-guess` | Client → Server | Submit a word guess |
| `get-room-status` | Client → Server | Get current room status |
| `room-updated` | Server → Client | Room state updated |
| `game-started` | Server → Client | Game has started |
| `guess-submitted` | Server → Client | Guess was submitted |
| `player-eliminated` | Server → Client | Player eliminated |
| `game-over` | Server → Client | Game has ended |

## 🎮 Game Modes

### Duel Mode
- **Players**: 2 players maximum
- **Objective**: First player to guess the word wins
- **Scoring**: Lower attempt count = better score
- **End Condition**: Game ends when first player wins or both fail

### Battle Royale Mode
- **Players**: 2-8 players
- **Objective**: Last player standing wins
- **Elimination**: Players are eliminated when they run out of attempts
- **End Condition**: Game ends when only one player remains

## 🔒 Security Features

- **Helmet.js** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - Request throttling
- **Input Validation** - Sanitized inputs
- **Error Handling** - No sensitive data leakage

## 📊 Logging

The server uses Winston for structured logging with:

- **File Rotation** - Automatic log file management
- **Multiple Levels** - Error, info, debug logging
- **Structured Data** - JSON format with metadata
- **Separate Logs** - Error, access, and combined logs

## 🐳 Docker Support

### Build and Run
```bash
# Build image
docker build -t word-duel-server .

# Run container
docker run -p 3001:3001 word-duel-server

# Using Docker Compose
docker-compose up -d
```

### Docker Compose
```yaml
version: '3.8'
services:
  word-duel-server:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

## 🚀 Deployment

### PM2 Process Manager
```bash
# Start with PM2
npm run pm2:start

# Monitor processes
npm run pm2:monit

# View logs
npm run pm2:logs
```

### Environment-Specific Configs
- **Development**: Hot reloading with nodemon
- **Production**: PM2 process management
- **Docker**: Containerized deployment

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Linting
npm run lint

# Format code
npm run format
```

## 📈 Monitoring & Health

### Health Check
- **Endpoint**: `GET /health`
- **Response**: Server status, uptime, environment info

### Metrics
- Connected clients count
- Active room count
- Word validation statistics
- Room cleanup metrics

## 🔧 Development

### Code Structure
- **Modular Design** - Separated concerns and responsibilities
- **Middleware Pattern** - Reusable Express middleware
- **Utility Classes** - Encapsulated business logic
- **Error Handling** - Centralized error management

### Adding New Features
1. Create utility module in `utils/`
2. Add validation rules in `middleware/validation.js`
3. Create route handlers in `routes/`
4. Add Socket.IO events in `socket/`
5. Update configuration in `config.js`

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For questions or issues:
- Create an issue in the repository
- Check the logs for debugging information
- Review the API documentation above
