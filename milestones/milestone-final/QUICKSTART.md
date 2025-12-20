# 🚀 Quick Start Guide - Uno Game

Get up and running in 5 minutes!

## Prerequisites
- ✅ Node.js installed (version 14+)
- ✅ PostgreSQL installed and running (version 12+)

## Installation (5 steps)

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Database
```bash
createdb uno_game
```

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and set your PostgreSQL credentials:
```env
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=uno_game
SESSION_SECRET=change-this-to-random-string
```

### 4. Run Migrations
```bash
npm run migrate:up
```

### 5. Start Server
```bash
npm start
```

## Access Application
Open your browser: **http://localhost:3000**

## First Game

1. **Sign up** for an account (or play as guest)
2. **Create a game** with a name
3. **Open another browser tab** (incognito mode)
4. **Join the game** you created
5. **Start the game** and play!

## Common Commands

```bash
npm start           # Start production server
npm run dev         # Start with auto-reload
npm run migrate:up  # Run database migrations
```

## Need Help?

- **Full Setup:** See [SETUP.md](./SETUP.md)
- **Features:** See [README.md](./README.md)
- **Details:** See [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)

## Troubleshooting

**Can't connect to database?**
```bash
# Check PostgreSQL is running
pg_isready

# Update .env with correct credentials
```

**Port 3000 in use?**
```bash
# Change port in .env
PORT=3001
```

**Migration errors?**
```bash
# Run migrations again
npm run migrate:up
```

---

**That's it! Start playing Uno!** 🎉
