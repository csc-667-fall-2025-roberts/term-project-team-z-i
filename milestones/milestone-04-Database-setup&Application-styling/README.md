# Uno Game - Term Project

## Milestone 4: Database Setup & Application Styling

This project implements a multiplayer Uno game with database migrations and professional styling.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database and update the `.env` file with your database credentials:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/uno_game
DB_USER=your_username
DB_PASSWORD=your_password
DB_HOST=localhost
DB_NAME=uno_game
DB_PORT=5432
```

### 3. Run Migrations

```bash
npm run migrate:up
```

To rollback migrations:
```bash
npm run migrate:down
```

### 4. Start the Server

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Database Schema

### Required Tables

- **users**: User accounts (id, username, email, password_hash, created_at)
- **games**: Game instances (id, name, created_by, state, max_players, created_at)
- **game_players**: Player-game relationships (game_id, user_id, joined_at)
- **hands**: Player hands in games (id, game_id, user_id, cards, created_at, updated_at)
- **game_state**: Current game state (id, game_id, current_player, discard_pile, draw_pile, direction)
- **messages**: Chat messages (id, user_id, game_id, message, created_at)

## Styling Approach

This project uses **Vanilla CSS** with a custom stylesheet (`public/css/style.css`). The design features:

- Consistent color scheme (purple gradient theme)
- Professional typography
- Responsive design
- Styled forms with focus states
- Hover effects on interactive elements
- Card-based layout system

## Pages

1. **Login** (`/auth/login`) - User authentication
2. **Signup** (`/auth/signup`) - New user registration
3. **Lobby** (`/lobby`) - Game list and creation
4. **Game** (`/games/:id`) - Game interface with visual mock-up
5. **Error** (`/error`) - Error handling page

## Migration Commands

- Create new migration: `npm run migrate:create migration_name`
- Run migrations: `npm run migrate:up`
- Rollback migrations: `npm run migrate:down`

## Project Structure

```
.
├── migrations/          # Database migrations
├── views/              # EJS templates
│   ├── auth/          # Login/signup pages
│   └── games/         # Game pages
├── public/             # Static files
│   └── css/           # Stylesheets
├── server.js          # Express server
└── package.json       # Dependencies
```
