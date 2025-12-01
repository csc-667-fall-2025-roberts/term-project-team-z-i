# Setup Instructions

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create PostgreSQL Database

```bash
createdb uno_game
```

Or using psql:
```sql
CREATE DATABASE uno_game;
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/uno_game
DB_USER=your_username
DB_PASSWORD=your_password
DB_HOST=localhost
DB_NAME=uno_game
DB_PORT=5432
NODE_ENV=development
PORT=3000
```

Replace `your_username` and `your_password` with your PostgreSQL credentials.

### 4. Run Database Migrations

```bash
npm run migrate:up
```

This will create all the required tables:
- users
- games
- game_players
- messages
- hands
- game_state

To verify migrations worked:
```bash
psql -d uno_game -c "\dt"
```

To rollback migrations:
```bash
npm run migrate:down
```

### 5. Start the Server

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 6. Test the Application

1. Navigate to `http://localhost:3000`
2. You should be redirected to the login page
3. Click "Sign up" to see the signup page
4. Navigate to `/lobby` to see the lobby (with mock data if no games exist)
5. Navigate to `/games/1` to see the game mock-up
6. Navigate to `/error` to see the error page

## Troubleshooting

### Migration Errors

If you get migration errors:
1. Make sure PostgreSQL is running
2. Check your database credentials in `.env`
3. Ensure the database exists
4. Try rolling back and re-running: `npm run migrate:down && npm run migrate:up`

### Port Already in Use

If port 3000 is in use, change the PORT in `.env`:
```env
PORT=3001
```

### Database Connection Issues

Verify your PostgreSQL connection:
```bash
psql -U your_username -d uno_game
```

If this fails, check:
- PostgreSQL is running
- Credentials are correct
- Database exists

