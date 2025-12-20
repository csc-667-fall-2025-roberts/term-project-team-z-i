# 🎮 Uno Game - Multiplayer Card Game

A real-time multiplayer Uno card game built with Node.js, Express, Socket.io, and PostgreSQL. Play the classic card game with friends online with real-time updates and chat functionality.

![Uno Game](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)

## ✨ Features

### Core Gameplay
- 🎯 **Real-time Multiplayer** - Play with 2-10 players simultaneously
- 🤖 **AI Opponents** - Add computer players for single-player mode
- 🃏 **Complete Uno Rules** - All standard Uno cards and rules implemented
- ⚡ **Live Updates** - Real-time game state updates using WebSocket (Socket.io)
- 🎲 **Turn-based Gameplay** - Automatic turn management and validation
- 🏆 **Win Detection** - Automatic winner detection when a player has no cards

### User Features
- 👤 **User Authentication** - Secure signup/login with bcrypt password hashing
- 👥 **Guest Mode** - Play without creating an account
- 💬 **Real-time Chat** - Lobby and in-game chat functionality
- 🎨 **Beautiful UI** - Modern, responsive design with smooth animations

### Game Features
- 🎮 **Game Lobby** - Create and join games easily
- 🤖 **AI Players** - Add intelligent computer opponents with one click
- 📊 **Game State Management** - Persistent game state stored in PostgreSQL
- 🔄 **Card Drawing** - Draw cards from the deck
- 🎴 **Card Playing** - Play valid cards based on color or value
- ↩️ **Special Cards** - Reverse, Skip, Draw 2, Wild, and Wild Draw 4 cards
- 🔀 **Direction Management** - Clockwise and counterclockwise gameplay

## 🚀 Quick Start

### Prerequisites
- Node.js (>= 14.0.0)
- PostgreSQL (>= 12.0)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   cd milestones/milestone-final
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   
   Create a PostgreSQL database:
   ```bash
   createdb uno_game
   ```

4. **Configure environment variables**
   
   Copy the example environment file and update with your settings:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update:
   ```env
   DB_USER=your_postgres_username
   DB_PASSWORD=your_postgres_password
   DB_HOST=localhost
   DB_NAME=uno_game
   DB_PORT=5432
   SESSION_SECRET=your-secret-key-here
   ```

5. **Run database migrations**
   ```bash
   npm run migrate:up
   ```

6. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

7. **Open your browser**
   
   Navigate to `http://localhost:3000`

## 📖 How to Play

### Multiplayer Mode
1. **Create an Account** or **Play as Guest**
2. **Create a Game** or **Join an Existing Game**
3. **Wait for Players** to join (minimum 2 players)
4. **Start the Game** (game creator only)
5. **Play Your Turn**:
   - Click on a card in your hand to play it (must match color or value)
   - Click the draw pile to draw a card if you can't play
6. **Win** by being the first to play all your cards!

### Single-Player Mode (vs AI)
1. **Create an Account** or **Play as Guest**
2. **Create a New Game**
3. **Add AI Players** by clicking the "➕ Add AI Player" button
   - You can add multiple AI opponents (up to max players - 1)
   - AI players will play automatically on their turns
4. **Start the Game**
5. **Play Your Turn** - AI will respond automatically!
6. **Win** by being the first to play all your cards!

> 💡 **Tip**: AI opponents make intelligent decisions and handle all card types. Perfect for practicing or playing solo!

### Uno Rules

- **Number Cards (0-9)**: Match the color or number
- **Skip**: Next player loses their turn
- **Reverse**: Reverse the direction of play
- **Draw Two**: Next player draws 2 cards and loses their turn
- **Wild**: Play on any card, choose the color
- **Wild Draw Four**: Next player draws 4 cards, choose the color

## 🏗️ Project Structure

```
milestone-final/
├── migrations/           # Database migration files
│   ├── 001_create_users.js
│   ├── 002_create_games.js
│   ├── 003_create_game_players.js
│   ├── 004_create_messages.js
│   ├── 005_create_hands.js
│   └── 006_create_game_state.js
├── public/              # Static assets
│   ├── css/
│   │   └── style.css   # Application styles
│   └── js/
│       └── game.js     # Client-side game logic
├── views/               # EJS templates
│   ├── auth/
│   │   ├── login.ejs
│   │   └── signup.ejs
│   ├── games/
│   │   └── show.ejs
│   ├── lobby.ejs
│   └── error.ejs
├── server.js            # Express server & Socket.io
├── db.js               # Database connection
├── package.json        # Dependencies
├── .env.example        # Environment template
└── README.md           # This file
```

## 🗄️ Database Schema

### Tables

1. **users** - User accounts
2. **games** - Game instances
3. **game_players** - Player-game relationships
4. **hands** - Player card hands
5. **game_state** - Current game state
6. **messages** - Chat messages

See `PROJECT_SUMMARY.md` for detailed schema information.

## 🛠️ Technologies Used

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **Socket.io** - Real-time bidirectional communication
- **PostgreSQL** - Relational database
- **node-pg-migrate** - Database migrations
- **bcrypt** - Password hashing
- **express-session** - Session management

### Frontend
- **EJS** - Templating engine
- **Vanilla JavaScript** - Client-side logic
- **CSS3** - Styling with animations
- **Socket.io Client** - Real-time updates

## 📝 Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon
- `npm run migrate:up` - Run all pending migrations
- `npm run migrate:down` - Rollback the last migration
- `npm run migrate:create <name>` - Create a new migration

## 🔒 Security Features

- **Password Hashing** - bcrypt with salt rounds
- **Session Management** - Secure session cookies
- **SQL Injection Prevention** - Parameterized queries
- **XSS Protection** - EJS auto-escaping
- **Environment Variables** - Sensitive data in .env

## 🎨 Features Showcase

### Authentication System
- Secure user registration and login
- Password hashing with bcrypt
- Session-based authentication
- Guest play option

### Real-time Gameplay
- WebSocket-based communication
- Instant card plays and draws
- Live turn updates
- Real-time player status

### Chat System
- Lobby-wide chat
- In-game chat
- System messages
- Real-time message updates

### Game Management
- Create custom games
- Set player limits
- Join existing games
- Automatic game state persistence

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
pg_isready

# Verify database exists
psql -l | grep uno_game
```

### Migration Issues
```bash
# Reset migrations (WARNING: deletes all data)
npm run migrate:down
npm run migrate:up
```

### Port Already in Use
```bash
# Change PORT in .env file
PORT=3001
```

## 📚 Additional Documentation

- [SETUP.md](./SETUP.md) - Detailed setup instructions
- [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) - Complete project documentation

## 👥 Contributing

This is a student project for educational purposes.

## 📄 License

ISC

## 🙏 Acknowledgments

- Classic Uno card game by Mattel
- Socket.io for real-time communication
- PostgreSQL for reliable data storage

---

**Enjoy playing Uno!** 🎉

For questions or issues, please refer to the documentation or create an issue in the repository.
