require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

app.get('/auth/login', (req, res) => {
  res.render('auth/login', { error: null });
});

app.get('/auth/signup', (req, res) => {
  res.render('auth/signup', { error: null });
});

app.get('/lobby', async (req, res) => {
  try {
    // Fetch games from database
    const gamesResult = await db.query(`
      SELECT g.*, 
             COUNT(gp.user_id) as current_players,
             u.username as creator_name
      FROM games g
      LEFT JOIN game_players gp ON g.id = gp.game_id
      LEFT JOIN users u ON g.created_by = u.id
      GROUP BY g.id, u.username
      ORDER BY g.created_at DESC
    `);
    
    const games = gamesResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      created_by: row.creator_name || 'Unknown',
      state: row.state,
      max_players: row.max_players,
      current_players: parseInt(row.current_players) || 0
    }));
    
    res.render('lobby', { 
      user: { username: 'DemoUser', email: 'demo@example.com' },
      games 
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to load games'));
  }
});

app.get('/games/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Fetch game data
    const gameResult = await db.query(`
      SELECT g.*, u.username as creator_name
      FROM games g
      LEFT JOIN users u ON g.created_by = u.id
      WHERE g.id = $1
    `, [gameId]);
    
    if (gameResult.rows.length === 0) {
      return res.redirect('/error?message=' + encodeURIComponent('Game not found'));
    }
    
    const gameData = gameResult.rows[0];
    
    // Fetch players
    const playersResult = await db.query(`
      SELECT u.username
      FROM game_players gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = $1
      ORDER BY gp.joined_at
    `, [gameId]);
    
    // Fetch current player from game_state
    const stateResult = await db.query(`
      SELECT u.username as current_player_name
      FROM game_state gs
      LEFT JOIN users u ON gs.current_player = u.id
      WHERE gs.game_id = $1
    `, [gameId]);
    
    const game = {
      id: gameData.id,
      name: gameData.name || 'Uno Game',
      state: gameData.state,
      current_player: stateResult.rows[0]?.current_player_name || playersResult.rows[0]?.username || 'DemoUser',
      players: playersResult.rows.map(row => row.username)
    };
    
    res.render('games/show', { game });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to load game'));
  }
});

app.get('/error', (req, res) => {
  const error = req.query.message || 'An error occurred';
  res.render('error', { error });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Make sure to run migrations: npm run migrate:up`);
});

