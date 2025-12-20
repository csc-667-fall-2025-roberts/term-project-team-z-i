# 🛠️ Setup Guide - Uno Game

Complete step-by-step setup instructions for the Uno Game application.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Installation Steps](#installation-steps)
3. [Database Setup](#database-setup)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Troubleshooting](#troubleshooting)

## System Requirements

### Required Software
- **Node.js**: Version 14.0.0 or higher
- **PostgreSQL**: Version 12.0 or higher
- **npm**: Version 6.0.0 or higher (comes with Node.js)

### Operating System
- macOS, Linux, or Windows 10/11
- 2GB RAM minimum
- 500MB free disk space

### Check Your Versions
```bash
node --version    # Should be >= v14.0.0
npm --version     # Should be >= 6.0.0
psql --version    # Should be >= 12.0
```

## Installation Steps

### 1. Navigate to Project Directory
```bash
cd /path/to/term-project-team-z-i/milestones/milestone-final
```

### 2. Install Node.js Dependencies
```bash
npm install
```

This will install:
- express (web framework)
- socket.io (real-time communication)
- pg (PostgreSQL client)
- bcrypt (password hashing)
- ejs (templating engine)
- express-session (session management)
- node-pg-migrate (database migrations)
- dotenv (environment variables)
- nodemon (development auto-reload)

### 3. Verify Installation
```bash
npm list --depth=0
```

You should see all dependencies listed without errors.

## Database Setup

### Option 1: Using PostgreSQL Command Line

#### Step 1: Create Database
```bash
# Connect to PostgreSQL
psql postgres

# Create database
CREATE DATABASE uno_game;

# Create user (optional, if you need a new user)
CREATE USER uno_admin WITH PASSWORD 'your_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE uno_game TO uno_admin;

# Exit psql
\q
```

#### Step 2: Verify Database
```bash
psql -l | grep uno_game
```

### Option 2: Using pgAdmin or GUI Tool

1. Open pgAdmin or your preferred PostgreSQL GUI
2. Right-click on "Databases" → "Create" → "Database"
3. Name: `uno_game`
4. Owner: Your PostgreSQL user
5. Click "Save"

### Option 3: Using createdb Command
```bash
createdb uno_game
```

## Configuration

### 1. Create Environment File
```bash
cp .env.example .env
```

### 2. Edit .env File

Open `.env` in your text editor and configure:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_USER=your_postgres_username       # e.g., postgres
DB_PASSWORD=your_postgres_password   # your PostgreSQL password
DB_HOST=localhost
DB_NAME=uno_game
DB_PORT=5432

# Session Secret (IMPORTANT: Change this!)
SESSION_SECRET=your-random-secret-key-here-change-me
```

#### Finding Your PostgreSQL Credentials

**On macOS:**
```bash
# Default user is usually your macOS username or 'postgres'
whoami

# Check PostgreSQL config
cat ~/Library/Application\ Support/Postgres/var-14/postgresql.conf
```

**On Linux:**
```bash
# Default user is usually 'postgres'
sudo -u postgres psql
\conninfo
\q
```

**On Windows:**
- Usually `postgres` user with password set during installation
- Check pgAdmin for connection details

### 3. Generate Session Secret

For security, generate a random session secret:

```bash
# On macOS/Linux
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use an online generator
```

Copy the output and paste it as your `SESSION_SECRET` value.

## Running Database Migrations

### Run All Migrations
```bash
npm run migrate:up
```

You should see output like:
```
> uno-game-final@1.0.0 migrate:up
> node-pg-migrate up

> 001_create_users.js
> 002_create_games.js
> 003_create_game_players.js
> 004_create_messages.js
> 005_create_hands.js
> 006_create_game_state.js
```

### Verify Tables Were Created
```bash
psql uno_game

# List all tables
\dt

# You should see:
# users, games, game_players, messages, hands, game_state, pgmigrations

# Exit
\q
```

### If Migrations Fail

1. **Check database connection:**
   ```bash
   psql -h localhost -U your_username -d uno_game
   ```

2. **Reset migrations (WARNING: Deletes all data):**
   ```bash
   npm run migrate:down
   npm run migrate:up
   ```

3. **Check migration status:**
   ```bash
   psql uno_game
   SELECT * FROM pgmigrations;
   \q
   ```

## Running the Application

### Production Mode
```bash
npm start
```

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Expected Output
```
Server running on http://localhost:3000
Make sure to run migrations: npm run migrate:up
Connected to PostgreSQL database
```

### Access the Application

Open your web browser and navigate to:
```
http://localhost:3000
```

You should see the Uno Game lobby page!

## First Steps After Installation

### 1. Create Your First Account
- Click "Sign Up"
- Enter username, email, and password
- Click "Sign Up" button

### 2. Create Your First Game
- Enter a game name
- Select max players
- Click "Create Game"

### 3. Test Guest Mode
- Open a new incognito/private browser window
- Go to `http://localhost:3000`
- Join the game you created

## Troubleshooting

### Problem: "Cannot find module 'express'"
**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Problem: "password authentication failed"
**Solution:**
1. Check your `.env` file credentials
2. Verify PostgreSQL is running:
   ```bash
   pg_isready
   ```
3. Reset PostgreSQL password if needed:
   ```bash
   psql postgres
   ALTER USER your_username WITH PASSWORD 'new_password';
   \q
   ```

### Problem: "relation 'users' does not exist"
**Solution:**
```bash
npm run migrate:up
```

### Problem: "Port 3000 is already in use"
**Solution:**
1. Change port in `.env`:
   ```env
   PORT=3001
   ```
2. Or kill the process using port 3000:
   ```bash
   # On macOS/Linux
   lsof -ti:3000 | xargs kill -9
   
   # On Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

### Problem: Migration files not found
**Solution:**
```bash
# Make sure you're in the correct directory
pwd
# Should end with: /milestone-final

# Check migrations directory exists
ls migrations/
```

### Problem: Database connection timeout
**Solution:**
1. Check if PostgreSQL is running:
   ```bash
   # macOS (if installed via Homebrew)
   brew services list
   
   # Linux
   sudo systemctl status postgresql
   
   # Start if not running
   brew services start postgresql  # macOS
   sudo systemctl start postgresql # Linux
   ```

2. Check PostgreSQL is listening on port 5432:
   ```bash
   netstat -an | grep 5432
   ```

### Problem: Session secret warnings
**Solution:**
Make sure you changed `SESSION_SECRET` in `.env` to a random string, not the default value.

## Development Tools

### Recommended VS Code Extensions
- ESLint
- Prettier
- PostgreSQL (by Chris Kolkman)
- EJS Language Support

### Database GUI Tools
- **pgAdmin** (Free, cross-platform)
- **TablePlus** (macOS, Windows, Linux)
- **DBeaver** (Free, cross-platform)

### Testing the Application

#### Test User Registration
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&email=test@example.com&password=test123"
```

#### Test Database Connection
```bash
psql uno_game
SELECT * FROM users;
\q
```

## Advanced Configuration

### Using DATABASE_URL Instead
If you prefer, you can use a single DATABASE_URL:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/uno_game
```

Then update `db.js`:
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

### Custom Port Configuration
```env
PORT=8080
```

### Production Deployment Notes
1. Set `NODE_ENV=production`
2. Use a strong `SESSION_SECRET`
3. Enable HTTPS
4. Use environment-specific database
5. Set `cookie.secure = true` in session config

## Next Steps

After successful setup:
1. ✅ Read [README.md](./README.md) for features overview
2. ✅ Read [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) for technical details
3. ✅ Start creating games and playing!

## Getting Help

If you encounter issues not covered here:
1. Check the console output for error messages
2. Check PostgreSQL logs
3. Verify all environment variables are set correctly
4. Ensure PostgreSQL is running and accessible

---

**Happy Gaming!** 🎮
