// --- Persistent cleanup for inactive games ---
// This will delete games (and related data) that have been inactive for more than INACTIVITY_MS, even after server restart.
setInterval(async () => {
  try {
    // Find games where last activity (created_at or updated_at) is older than INACTIVITY_MS
    // We'll use the latest of created_at from games and the latest created_at from messages/game_state/hands/game_players
    // For simplicity, use games.created_at (creation) and COALESCE of latest message, hand, game_state, game_player
    const threshold = new Date(Date.now() - INACTIVITY_MS);
    const oldGamesRes = await db.query(`
      SELECT g.id FROM games g
      LEFT JOIN (
        SELECT game_id, MAX(created_at) AS last_msg FROM messages GROUP BY game_id
      ) m ON g.id = m.game_id
      LEFT JOIN (
        SELECT game_id, MAX(created_at) AS last_hand FROM hands GROUP BY game_id
      ) h ON g.id = h.game_id
      LEFT JOIN (
        SELECT game_id, MAX(created_at) AS last_state FROM game_state GROUP BY game_id
      ) s ON g.id = s.game_id
      LEFT JOIN (
        SELECT game_id, MAX(joined_at) AS last_player FROM game_players GROUP BY game_id
      ) p ON g.id = p.game_id
      WHERE COALESCE(m.last_msg, h.last_hand, s.last_state, p.last_player, g.created_at) < $1
    `, [threshold]);
    for (const row of oldGamesRes.rows) {
      try {
        await deleteGameById(row.id);
        console.log(`Persistent cleanup: deleted inactive game ${row.id}`);
      } catch (err) {
        console.error('Persistent cleanup error for game', row.id, err);
      }
    }
  } catch (err) {
    console.error('Error in persistent inactive game cleanup:', err);
  }
}, 60 * 1000); // every 1 minute
require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Sessions (lightweight memory store for development)
const session = require('express-session');
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
// Landing: send users to the lobby by default so guests can play without logging in
app.get('/', (req, res) => {
  res.redirect('/lobby');
});

// Optional: quick guest route that redirects to the lobby. We keep it simple —
// lobby rendering already uses a demo user when no authenticated user is present.
app.get('/guest', (req, res) => {
  res.redirect('/lobby');
});

app.get('/auth/login', (req, res) => {
  res.render('auth/login', { error: null });
});

app.get('/auth/signup', (req, res) => {
  res.render('auth/signup', { error: null });
});

// Auth endpoints
app.post('/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.render('auth/signup', { error: 'All fields required' });

    // check if user exists
    const exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
    if (exists.rows.length > 0) return res.render('auth/signup', { error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 10);
    const insert = await db.query('INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email', [username, email, hash]);
    req.session.userId = insert.rows[0].id;
    res.redirect('/lobby');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('auth/signup', { error: 'Signup failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.render('auth/login', { error: 'All fields required' });

    const user = await db.query('SELECT id, username, email, password_hash FROM users WHERE username=$1', [username]);
    if (user.rows.length === 0) return res.render('auth/login', { error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!match) return res.render('auth/login', { error: 'Invalid credentials' });

    req.session.userId = user.rows[0].id;
    res.redirect('/lobby');
  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', { error: 'Login failed' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/lobby', async (req, res) => {
  try {
    // Determine current user: authenticated session user or guest
    const currentUser = await getCurrentUser(req);
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

    // Load recent lobby messages (game_id IS NULL)
    const messagesRes = await db.query(`
      SELECT m.id, m.message, m.created_at, u.username
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.game_id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 100
    `);
    const messages = messagesRes.rows.map(r => ({ id: r.id, message: r.message, username: r.username || 'Unknown', created_at: new Date(r.created_at).toLocaleString() })).reverse();

    res.render('lobby', { 
      user: currentUser,
      games,
      messages
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to load games'));
  }
});

// Post a lobby chat message
app.post('/messages', async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const { message } = req.body;
    if (!message || !message.trim()) return res.redirect('/lobby');
    await db.query('INSERT INTO messages (user_id, message, created_at) VALUES ($1,$2,NOW())', [currentUser.id, message.trim()]);
    // Enforce max 10 lobby messages (delete oldest if over 10)
    await db.query(`DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE game_id IS NULL ORDER BY created_at DESC OFFSET 10
    )`);
    res.redirect('/lobby');
  } catch (err) {
    console.error('Error posting lobby message:', err);
    res.redirect('/error?message=' + encodeURIComponent('Failed to post message'));
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
    
    // Determine current user (session or guest) and ensure they're in game_players
    const currentUser = await getCurrentUser(req);
    // add current user to game_players if not already present
    await db.query(
      `INSERT INTO game_players (game_id, user_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2)`
      , [gameId, currentUser.id]
    );

    // Fetch players
    const playersResult = await db.query(`
      SELECT u.username
      FROM game_players gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = $1
      ORDER BY gp.joined_at
    `, [gameId]);
    // Fetch game messages
    const gameMessagesRes = await db.query(`
      SELECT m.id, m.message, m.created_at, u.username
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.game_id = $1
      ORDER BY m.created_at DESC
      LIMIT 200
    `, [gameId]);
    const gameMessages = gameMessagesRes.rows.map(r => ({ id: r.id, message: r.message, username: r.username || 'Unknown', created_at: new Date(r.created_at).toLocaleString() })).reverse();
    
    // Fetch current player from game_state
    const stateResult = await db.query(`
      SELECT u.username as current_player_name
      FROM game_state gs
      LEFT JOIN users u ON gs.current_player = u.id
      WHERE gs.game_id = $1
    `, [gameId]);
    
    // Load or create a hand for the current user for this game
    let handResult = await db.query(`SELECT cards FROM hands WHERE game_id=$1 AND user_id=$2`, [gameId, currentUser.id]);
    let hand;
    if (handResult.rows.length > 0) {
      hand = handResult.rows[0].cards;
    } else {
      hand = generateHand(7);
      await db.query(`INSERT INTO hands (game_id, user_id, cards) VALUES ($1,$2,$3)`, [gameId, currentUser.id, JSON.stringify(hand)]);
    }

    const game = {
      id: gameData.id,
      name: gameData.name || 'Uno Game',
      state: gameData.state,
      created_by: gameData.created_by,
      current_player: stateResult.rows[0]?.current_player_name || playersResult.rows[0]?.username || currentUser.username,
      players: playersResult.rows.map(row => row.username)
    };
    
    // reset inactivity timer for this game since there's activity
    resetInactivityTimer(game.id);

    // reset inactivity timer for this game since there's activity
    resetInactivityTimer(game.id);

    res.render('games/show', { game, hand, user: currentUser, messages: gameMessages });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to load game'));
  }
});

// Post a game chat message
app.post('/games/:id/messages', async (req, res) => {
  try {
    const gameId = req.params.id;
    const currentUser = await getCurrentUser(req);
    const { message } = req.body;
    if (!message || !message.trim()) return res.redirect(`/games/${gameId}`);
    await db.query('INSERT INTO messages (user_id, game_id, message, created_at) VALUES ($1,$2,$3,NOW())', [currentUser.id, gameId, message.trim()]);
    // Enforce max 10 messages per game chat (delete oldest if over 10)
    await db.query(`DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE game_id = $1 ORDER BY created_at DESC OFFSET 10
    )`, [gameId]);
    resetInactivityTimer(gameId);
    res.redirect(`/games/${gameId}`);
  } catch (err) {
    console.error('Error posting game message:', err);
    res.redirect('/error?message=' + encodeURIComponent('Failed to post message'));
  }
});
// --- Chat clearing intervals ---
// Clear all lobby chat every hour
setInterval(async () => {
  try {
    await db.query('DELETE FROM messages WHERE game_id IS NULL');
    console.log('Lobby chat cleared (hourly)');
  } catch (err) {
    console.error('Error clearing lobby chat:', err);
  }
}, 60 * 60 * 1000); // 1 hour

// Clear all game chats every hour
setInterval(async () => {
  try {
    await db.query('DELETE FROM messages WHERE game_id IS NOT NULL');
    console.log('Game chats cleared (hourly)');
  } catch (err) {
    console.error('Error clearing game chats:', err);
  }
}, 60 * 60 * 1000); // 1 hour

// Create a new game (form from lobby)
app.post('/games/create', async (req, res) => {
  try {
    const { gameName, maxPlayers } = req.body;
    const currentUser = await getCurrentUser(req);

    const result = await db.query(
      `INSERT INTO games (name, created_by, state, max_players) VALUES ($1, $2, 'waiting', $3) RETURNING id`,
      [gameName, currentUser.id, parseInt(maxPlayers) || 4]
    );

    const newGameId = result.rows[0].id;
    // Add the creator (guest) as a player
  await db.query(`INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)`, [newGameId, currentUser.id]);

    // start/reset inactivity timer for the new game
    resetInactivityTimer(newGameId);

    res.redirect(`/games/${newGameId}`);
  } catch (error) {
    console.error('Error creating game:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to create game'));
  }
});

// Helper: get or create a guest/demo user in the users table
async function getOrCreateGuestUser() {
  try {
    const existing = await db.query(`SELECT id, username, email FROM users WHERE username = $1`, ['Guest']);
    if (existing.rows.length > 0) return { ...existing.rows[0], isGuest: true };

    // Insert a lightweight guest user. password_hash is required by schema; use empty string.
    const insert = await db.query(`INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email`, ['Guest', 'guest@example.com', '']);
    return { ...insert.rows[0], isGuest: true };
  } catch (err) {
    console.error('Error ensuring guest user:', err);
    throw err;
  }
}

// Returns the session user if logged in, otherwise a guest user
async function getCurrentUser(req) {
  if (req.session && req.session.userId) {
    const userRes = await db.query('SELECT id, username, email FROM users WHERE id=$1', [req.session.userId]);
    if (userRes.rows.length > 0) return { ...userRes.rows[0], isGuest: false };
  }
  return await getOrCreateGuestUser();
}

// In-memory inactivity timers for games (development-only)
const inactivityTimers = new Map();
const INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes

function resetInactivityTimer(gameId) {
  if (!gameId) return;
  // clear existing timer
  const existing = inactivityTimers.get(gameId);
  if (existing) clearTimeout(existing);

  const t = setTimeout(async () => {
    try {
      console.log(`Auto-deleting inactive game ${gameId} after ${INACTIVITY_MS}ms`);
      await deleteGameById(gameId);
      inactivityTimers.delete(gameId);
    } catch (err) {
      console.error('Error auto-deleting game:', err);
    }
  }, INACTIVITY_MS);

  inactivityTimers.set(gameId, t);
}

async function deleteGameById(gameId) {
  // Delete game and related rows in a transaction
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM hands WHERE game_id=$1', [gameId]);
    await client.query('DELETE FROM game_players WHERE game_id=$1', [gameId]);
    await client.query('DELETE FROM game_state WHERE game_id=$1', [gameId]);
    await client.query('DELETE FROM messages WHERE game_id=$1', [gameId]);
    await client.query('DELETE FROM games WHERE id=$1', [gameId]);
    await client.query('COMMIT');
    console.log(`Game ${gameId} and related data deleted.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Manual delete route (only creator can delete)
app.post('/games/:id/delete', async (req, res) => {
  try {
    const gameId = req.params.id;
    const currentUser = await getCurrentUser(req);

    const gameRes = await db.query('SELECT created_by FROM games WHERE id=$1', [gameId]);
    if (gameRes.rows.length === 0) return res.redirect('/error?message=' + encodeURIComponent('Game not found'));
    const createdBy = gameRes.rows[0].created_by;

    if (currentUser.id !== createdBy) {
      return res.redirect('/error?message=' + encodeURIComponent('Only the game creator can delete this room'));
    }

    // delete immediately
    await deleteGameById(gameId);
    // clear timer if present
    const existing = inactivityTimers.get(gameId);
    if (existing) { clearTimeout(existing); inactivityTimers.delete(gameId); }

    res.redirect('/lobby');
  } catch (err) {
    console.error('Error deleting game:', err);
    res.redirect('/error?message=' + encodeURIComponent('Failed to delete game'));
  }
});

// Generate a random UNO-style card
function randomCard() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const numberValues = Array.from({ length: 10 }, (_, i) => String(i)); // '0'..'9'
  const actionValues = ['skip', 'reverse', 'draw2'];
  const wildValues = ['wild', 'wild_draw4'];

  const pick = Math.random();
  if (pick < 0.7) {
    // number card
    const color = colors[Math.floor(Math.random() * colors.length)];
    const value = numberValues[Math.floor(Math.random() * numberValues.length)];
    return { color, value };
  } else if (pick < 0.92) {
    // action card
    const color = colors[Math.floor(Math.random() * colors.length)];
    const value = actionValues[Math.floor(Math.random() * actionValues.length)];
    return { color, value };
  } else {
    // wild card
    const value = wildValues[Math.floor(Math.random() * wildValues.length)];
    return { color: 'wild', value };
  }
}

function generateHand(n = 7) {
  const hand = [];
  for (let i = 0; i < n; i++) hand.push(randomCard());
  return hand;
}

app.get('/error', (req, res) => {
  const error = req.query.message || 'An error occurred';
  res.render('error', { error });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Make sure to run migrations: npm run migrate:up`);
});

