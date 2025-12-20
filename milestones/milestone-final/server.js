require('dotenv').config();
const express = require('express');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// Store active turn timers: { gameId: timeoutId }
const turnTimers = {};
const TURN_TIMEOUT = 10000; // 10 seconds

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  }
});

app.use(sessionMiddleware);

// Share session with Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to get or create guest user
async function getOrCreateGuestUser() {
  try {
    const existing = await db.query(`SELECT id, username, email FROM users WHERE username = $1`, ['Guest']);
    if (existing.rows.length > 0) return { ...existing.rows[0], isGuest: true };
    
    const insert = await db.query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email`,
      ['Guest', 'guest@example.com', '']
    );
    return { ...insert.rows[0], isGuest: true };
  } catch (err) {
    console.error('Error ensuring guest user:', err);
    throw err;
  }
}

// Helper function to get or create AI player
async function getOrCreateAIPlayer(aiNumber = 1) {
  try {
    const aiUsername = `AI_Player_${aiNumber}`;
    const existing = await db.query(`SELECT id, username, email FROM users WHERE username = $1`, [aiUsername]);
    if (existing.rows.length > 0) return { ...existing.rows[0], isAI: true };
    
    const insert = await db.query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email`,
      [aiUsername, `ai${aiNumber}@game.ai`, '']
    );
    return { ...insert.rows[0], isAI: true };
  } catch (err) {
    console.error('Error ensuring AI player:', err);
    throw err;
  }
}

// Get current user (authenticated or guest)
async function getCurrentUser(req) {
  if (req.session && req.session.userId) {
    const userRes = await db.query('SELECT id, username, email FROM users WHERE id=$1', [req.session.userId]);
    if (userRes.rows.length > 0) return { ...userRes.rows[0], isGuest: false };
  }
  return await getOrCreateGuestUser();
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/lobby');
});

app.get('/auth/login', (req, res) => {
  res.render('auth/login', { error: null });
});

app.get('/auth/signup', (req, res) => {
  res.render('auth/signup', { error: null });
});

app.post('/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.render('auth/signup', { error: 'All fields required' });
    }

    const exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
    if (exists.rows.length > 0) {
      return res.render('auth/signup', { error: 'Username or email already taken' });
    }

    const hash = await bcrypt.hash(password, 10);
    const insert = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email',
      [username, email, hash]
    );
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
    if (!username || !password) {
      return res.render('auth/login', { error: 'All fields required' });
    }

    const user = await db.query(
      'SELECT id, username, email, password_hash FROM users WHERE username=$1',
      [username]
    );
    if (user.rows.length === 0) {
      return res.render('auth/login', { error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!match) {
      return res.render('auth/login', { error: 'Invalid credentials' });
    }

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
    const currentUser = await getCurrentUser(req);
    
    const gamesResult = await db.query(`
      SELECT g.*, 
             COUNT(gp.user_id) as current_players,
             u.username as creator_name
      FROM games g
      LEFT JOIN game_players gp ON g.id = gp.game_id
      LEFT JOIN users u ON g.created_by = u.id
      WHERE g.state != 'finished'
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

    const messagesRes = await db.query(`
      SELECT m.id, m.message, m.created_at, u.username
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.game_id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 100
    `);
    
    const messages = messagesRes.rows
      .map(r => ({
        id: r.id,
        message: r.message,
        username: r.username || 'Unknown',
        created_at: new Date(r.created_at).toLocaleString()
      }))
      .reverse();

    res.render('lobby', { user: currentUser, games, messages });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to load games'));
  }
});

// Post lobby message
app.post('/messages', async (req, res) => {
  console.log('=== POST /messages ===');
  console.log('Request body:', req.body);
  try {
    const currentUser = await getCurrentUser(req);
    console.log('Current user:', currentUser);
    const { message } = req.body;
    if (!message || !message.trim()) {
      console.log('Empty message, redirecting');
      return res.redirect('/lobby');
    }
    console.log('Inserting message:', message.trim());
    await db.query('INSERT INTO messages (user_id, message, created_at) VALUES ($1, $2, NOW())', [currentUser.id, message.trim()]);
    // Enforce max 100 lobby messages (delete oldest if over 100)
    await db.query(`DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE game_id IS NULL ORDER BY created_at DESC OFFSET 100
    )`);
    console.log('Message posted, redirecting to lobby');
    res.redirect('/lobby');
  } catch (err) {
    console.error('Error posting lobby message:', err);
    res.redirect('/error?message=' + encodeURIComponent('Failed to post message'));
  }
});

app.post('/games/create', async (req, res) => {
  console.log('=== POST /games/create ===');
  console.log('Request body:', req.body);
  try {
    const { gameName, maxPlayers } = req.body;
    const currentUser = await getCurrentUser(req);
    console.log('Current user:', currentUser);
    console.log('Creating game:', gameName, 'max players:', maxPlayers);

    const result = await db.query(
      `INSERT INTO games (name, created_by, state, max_players) VALUES ($1, $2, 'waiting', $3) RETURNING id`,
      [gameName, currentUser.id, parseInt(maxPlayers) || 4]
    );

    const newGameId = result.rows[0].id;
    console.log('Game created with ID:', newGameId);
    await db.query(`INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)`, [newGameId, currentUser.id]);
    console.log('User added to game, redirecting to /games/' + newGameId);

    res.redirect(`/games/${newGameId}`);
  } catch (error) {
    console.error('Error creating game:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to create game'));
  }
});

// Add AI player to game
app.post('/games/:id/add-ai', async (req, res) => {
  console.log('=== ADD AI PLAYER REQUEST ===');
  console.log('Game ID:', req.params.id);
  console.log('Request body:', req.body);
  console.log('Session:', req.session);
  
  try {
    const gameId = req.params.id;
    
    // Check if game is in waiting state
    const gameCheck = await db.query(
      `SELECT state, max_players FROM games WHERE id = $1`,
      [gameId]
    );
    
    console.log('Game check result:', gameCheck.rows);
    
    if (gameCheck.rows.length === 0) {
      console.log('Game not found');
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (gameCheck.rows[0].state !== 'waiting') {
      console.log('Game state is not waiting:', gameCheck.rows[0].state);
      return res.status(400).json({ error: 'Cannot add AI to a game that has already started' });
    }
    
    // Get current number of players
    const playersResult = await db.query(
      `SELECT COUNT(*) as count FROM game_players WHERE game_id = $1`,
      [gameId]
    );
    
    const currentPlayers = parseInt(playersResult.rows[0].count);
    const maxPlayers = parseInt(gameCheck.rows[0].max_players);
    
    console.log('Current players:', currentPlayers, 'Max players:', maxPlayers);
    
    if (currentPlayers >= maxPlayers) {
      console.log('Game is full');
      return res.status(400).json({ error: 'Game is full' });
    }
    
    // Create AI player
    console.log('Creating AI player...');
    const aiPlayer = await getOrCreateAIPlayer(currentPlayers);
    console.log('AI player created:', aiPlayer);
    
    // Add AI to game
    const insertResult = await db.query(
      `INSERT INTO game_players (game_id, user_id) 
       SELECT $1, $2 
       WHERE NOT EXISTS (
         SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2
       )
       RETURNING *`,
      [gameId, aiPlayer.id]
    );
    
    console.log('Insert result:', insertResult.rows);
    
    // Emit socket event to update all clients
    io.to(`game_${gameId}`).emit('player_joined', {
      userId: aiPlayer.id,
      username: aiPlayer.username
    });
    
    console.log('Emitted player_joined event');
    console.log('Sending success response');
    
    res.json({ 
      success: true, 
      player: { 
        id: aiPlayer.id, 
        username: aiPlayer.username 
      } 
    });
  } catch (error) {
    console.error('Error adding AI player:', error);
    res.status(500).json({ error: 'Failed to add AI player', details: error.message });
  }
});

// Leave game route
app.post('/games/:id/leave', async (req, res) => {
  try {
    const gameId = req.params.id;
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser) {
      return res.redirect('/login');
    }
    
    // Check if user is the creator
    const gameResult = await db.query(
      'SELECT created_by, state FROM games WHERE id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.redirect('/lobby?message=' + encodeURIComponent('Game not found'));
    }
    
    const game = gameResult.rows[0];
    
    // If creator is leaving a waiting game, they should delete it instead
    if (game.created_by === currentUser.id && game.state === 'waiting') {
      return res.redirect('/lobby?message=' + encodeURIComponent('Game creators must delete the game instead of leaving'));
    }
    
    // Remove player from game_players
    await db.query(
      'DELETE FROM game_players WHERE game_id = $1 AND user_id = $2',
      [gameId, currentUser.id]
    );
    
    // Remove player's hand if game is active
    await db.query(
      'DELETE FROM hands WHERE game_id = $1 AND user_id = $2',
      [gameId, currentUser.id]
    );
    
    // Emit socket event to notify other players
    io.to(`game_${gameId}`).emit('player_left', {
      userId: currentUser.id,
      username: currentUser.username,
      message: `${currentUser.username} has left the game`
    });
    
    console.log(`User ${currentUser.username} left game ${gameId}`);
    
    res.redirect('/lobby?message=' + encodeURIComponent('You have left the game'));
  } catch (error) {
    console.error('Error leaving game:', error);
    res.redirect('/lobby?message=' + encodeURIComponent('Failed to leave game'));
  }
});

// Delete game route
app.delete('/games/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Check if user is the creator
    const gameResult = await db.query(
      'SELECT created_by, state FROM games WHERE id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const game = gameResult.rows[0];
    
    if (game.created_by !== currentUser.id) {
      return res.status(403).json({ error: 'Only the game creator can delete the game' });
    }
    
    // Delete all related data (in order due to foreign keys)
    await db.query('DELETE FROM hands WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM game_state WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM messages WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM game_players WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM games WHERE id = $1', [gameId]);
    
    // Emit socket event to notify all players in the game
    io.to(`game_${gameId}`).emit('game_deleted', {
      message: 'This game has been deleted by the creator',
      creatorName: currentUser.username
    });
    
    console.log(`Game ${gameId} deleted by ${currentUser.username}`);
    
    res.json({ success: true, message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

app.get('/games/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    
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
    const currentUser = await getCurrentUser(req);
    
    // Add user to game if not already in
    await db.query(
      `INSERT INTO game_players (game_id, user_id) 
       SELECT $1, $2 
       WHERE NOT EXISTS (
         SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2
       )`,
      [gameId, currentUser.id]
    );

    const playersResult = await db.query(`
      SELECT u.id, u.username
      FROM game_players gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = $1
      ORDER BY gp.joined_at
    `, [gameId]);
    
    // Get card counts for all players
    const cardCountsResult = await db.query(`
      SELECT user_id, jsonb_array_length(cards) as card_count
      FROM hands
      WHERE game_id = $1
    `, [gameId]);
    
    const cardCounts = {};
    cardCountsResult.rows.forEach(row => {
      cardCounts[row.user_id] = row.card_count;
    });
    
    const gameMessagesRes = await db.query(`
      SELECT m.id, m.message, m.created_at, u.username
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.game_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50
    `, [gameId]);
    
    const gameMessages = gameMessagesRes.rows
      .map(r => ({
        id: r.id,
        message: r.message,
        username: r.username || 'Unknown',
        created_at: new Date(r.created_at).toLocaleString()
      }))
      .reverse();
    
    const stateResult = await db.query(`
      SELECT gs.*, u.username as current_player_name
      FROM game_state gs
      LEFT JOIN users u ON gs.current_player = u.id
      WHERE gs.game_id = $1
    `, [gameId]);
    
    let handResult = await db.query(
      `SELECT cards FROM hands WHERE game_id=$1 AND user_id=$2`,
      [gameId, currentUser.id]
    );
    
    let hand;
    if (handResult.rows.length > 0) {
      hand = handResult.rows[0].cards;
    } else {
      hand = [];
    }

    const game = {
      id: gameData.id,
      name: gameData.name || 'Uno Game',
      state: gameData.state,
      created_by: gameData.created_by,
      current_player: stateResult.rows[0]?.current_player_name || playersResult.rows[0]?.username || currentUser.username,
      current_player_id: stateResult.rows[0]?.current_player || null,
      players: playersResult.rows.map(row => ({ 
        id: row.id, 
        username: row.username,
        cardCount: cardCounts[row.id] || 0
      })),
      gameState: stateResult.rows[0] || null
    };

    res.render('games/show', { game, hand, user: currentUser, messages: gameMessages });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.redirect('/error?message=' + encodeURIComponent('Failed to load game'));
  }
});

// Post game message
app.post('/games/:id/messages', async (req, res) => {
  try {
    const gameId = req.params.id;
    const currentUser = await getCurrentUser(req);
    const { message } = req.body;
    if (!message || !message.trim()) return res.redirect(`/games/${gameId}`);
    await db.query('INSERT INTO messages (user_id, game_id, message, created_at) VALUES ($1, $2, $3, NOW())', [currentUser.id, gameId, message.trim()]);
    // Enforce max 50 messages per game chat (delete oldest if over 50)
    await db.query(`DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE game_id = $1 ORDER BY created_at DESC OFFSET 50
    )`, [gameId]);
    res.redirect(`/games/${gameId}`);
  } catch (err) {
    console.error('Error posting game message:', err);
    res.redirect('/error?message=' + encodeURIComponent('Failed to post message'));
  }
});

app.get('/error', (req, res) => {
  const error = req.query.message || 'An error occurred';
  res.render('error', { error });
});

// Socket.io game logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_game', async (data) => {
    try {
      const { gameId, userId } = data;
      socket.join(`game_${gameId}`);
      
      // Update game activity (touch timestamp)
      await db.query(
        `UPDATE game_state SET updated_at = NOW() WHERE game_id = $1`,
        [gameId]
      );
      
      // Get username for the player who joined
      const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
      const username = userResult.rows[0]?.username || 'Unknown Player';
      
      // Broadcast to others in the game
      socket.to(`game_${gameId}`).emit('player_joined', {
        userId,
        username,
        message: `${username} joined the game`
      });
      
      console.log(`User ${userId} (${username}) joined game ${gameId}`);
    } catch (error) {
      console.error('Error joining game:', error);
    }
  });
  
  socket.on('start_game', async (data) => {
    try {
      const { gameId } = data;
      
      // Get all players
      const playersResult = await db.query(`
        SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY joined_at
      `, [gameId]);
      
      const playerIds = playersResult.rows.map(r => r.user_id);
      
      // Create deck and deal cards
      const deck = createDeck();
      shuffleDeck(deck);
      
      // Deal 7 cards to each player
      for (const playerId of playerIds) {
        const hand = deck.splice(0, 7);
        await db.query(
          `INSERT INTO hands (game_id, user_id, cards) VALUES ($1, $2, $3)
           ON CONFLICT (game_id, user_id) DO UPDATE SET cards = $3, updated_at = NOW()`,
          [gameId, playerId, JSON.stringify(hand)]
        );
      }
      
      // Set up game state
      // Find first non-wild card for starting card
      let topCardIndex = deck.findIndex(card => card.value !== 'wild' && card.value !== 'wild_draw4');
      if (topCardIndex === -1) {
        // If all remaining cards are wild (unlikely), just use first card
        topCardIndex = 0;
      }
      const topCard = deck.splice(topCardIndex, 1)[0];
      const currentPlayer = playerIds[0];
      
      await db.query(
        `INSERT INTO game_state (game_id, current_player, discard_pile, draw_pile, direction)
         VALUES ($1, $2, $3, $4, 'clockwise')
         ON CONFLICT (game_id) DO UPDATE 
         SET current_player = $2, discard_pile = $3, draw_pile = $4, direction = 'clockwise', updated_at = NOW()`,
        [gameId, currentPlayer, JSON.stringify([topCard]), JSON.stringify(deck)]
      );
      
      // Update game state
      await db.query(`UPDATE games SET state = 'active' WHERE id = $1`, [gameId]);
      
      // Notify all players
      io.to(`game_${gameId}`).emit('game_started', {
        message: 'Game has started!',
        currentPlayer
      });
      
      // Start turn timer for the first player
      startTurnTimer(gameId, currentPlayer, io);
      
      // Check if first player is AI
      const firstPlayerResult = await db.query(
        `SELECT username FROM users WHERE id = $1 AND username LIKE 'AI_Player_%'`,
        [currentPlayer]
      );
      
      if (firstPlayerResult.rows.length > 0) {
        // First player is AI, start their turn
        setTimeout(() => makeAIMove(gameId, currentPlayer, io), 2000);
      }
      
      console.log(`Game ${gameId} started`);
    } catch (error) {
      console.error('Error starting game:', error);
    }
  });
  
  socket.on('play_card', async (data) => {
    try {
      const { gameId, userId, card } = data;
      
      // Get game state
      const stateResult = await db.query(
        `SELECT * FROM game_state WHERE game_id = $1`,
        [gameId]
      );
      
      if (stateResult.rows.length === 0) {
        socket.emit('error', { message: 'Game state not found' });
        return;
      }
      
      const gameState = stateResult.rows[0];
      
      // Verify it's the player's turn
      if (gameState.current_player !== userId) {
        socket.emit('error', { message: 'Not your turn!' });
        return;
      }
      
      // Get player's hand
      const handResult = await db.query(
        `SELECT cards FROM hands WHERE game_id = $1 AND user_id = $2`,
        [gameId, userId]
      );
      
      if (handResult.rows.length === 0) {
        socket.emit('error', { message: 'Hand not found' });
        return;
      }
      
      let hand = handResult.rows[0].cards;
      const topCard = gameState.discard_pile[gameState.discard_pile.length - 1];
      
      // Verify card can be played
      if (!canPlayCard(card, topCard)) {
        socket.emit('error', { message: 'Cannot play that card!' });
        return;
      }
      
      // Remove card from hand
      // For wild cards, match by value only since color was changed by player
      let cardIndex = -1;
      
      if (card.value === 'wild' || card.value === 'wild_draw4') {
        // Wild cards: match by value only
        cardIndex = hand.findIndex(c => c.value === card.value);
        console.log('Wild card matching:', { cardValue: card.value, foundIndex: cardIndex });
      } else {
        // Regular cards: try multiple matching strategies
        console.log('Attempting to match card:', { 
          cardToPlay: card, 
          handCards: hand.map((c, i) => ({ index: i, color: c.color, value: c.value }))
        });
        
        // Strategy 1: Exact match
        cardIndex = hand.findIndex(c => c.color === card.color && c.value === card.value);
        if (cardIndex !== -1) console.log('Found with exact match at index:', cardIndex);
        
        // Strategy 2: Case-insensitive match
        if (cardIndex === -1) {
          cardIndex = hand.findIndex(c => 
            String(c.color).toLowerCase() === String(card.color).toLowerCase() && 
            String(c.value).toLowerCase() === String(card.value).toLowerCase()
          );
          if (cardIndex !== -1) console.log('Found with case-insensitive match at index:', cardIndex);
        }
        
        // Strategy 3: Match by value only (for any card with matching value and color)
        if (cardIndex === -1) {
          cardIndex = hand.findIndex(c => {
            const colorMatch = String(c.color).trim() === String(card.color).trim();
            const valueMatch = String(c.value).trim() === String(card.value).trim();
            return colorMatch && valueMatch;
          });
          if (cardIndex !== -1) console.log('Found with trimmed match at index:', cardIndex);
        }
        
        // Strategy 4: For special cards, just match any card with same value and color (very lenient)
        if (cardIndex === -1) {
          cardIndex = hand.findIndex(c => {
            return c.value == card.value && c.color == card.color;  // Use == for type coercion
          });
          if (cardIndex !== -1) console.log('Found with loose equality at index:', cardIndex);
        }
      }
      
      if (cardIndex === -1) {
        console.error('CARD NOT FOUND - Detailed debug:', { 
          cardToPlay: card,
          cardToPlayType: { color: typeof card.color, value: typeof card.value },
          cardToPlayString: JSON.stringify(card),
          hand: hand.map((c, i) => ({ 
            index: i, 
            color: c.color, 
            value: c.value, 
            types: { color: typeof c.color, value: typeof c.value },
            str: JSON.stringify(c)
          })),
          userId 
        });
        socket.emit('error', { message: 'Card not in hand!' });
        return;
      }
      
      hand.splice(cardIndex, 1);
      
      // Update hand
      await db.query(
        `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
        [JSON.stringify(hand), gameId, userId]
      );
      
      // Update discard pile
      const newDiscardPile = [...gameState.discard_pile, card];
      
      // Handle reverse card first (before calculating next player)
      let newDirection = gameState.direction;
      if (card.value === 'reverse') {
        newDirection = gameState.direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
      }
      
      // Get next player (using the new direction if reversed)
      const playersResult = await db.query(
        `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY joined_at`,
        [gameId]
      );
      const playerIds = playersResult.rows.map(r => r.user_id);
      let nextPlayer = getNextPlayer(playerIds, userId, newDirection, card);
      
      // Handle Draw 2 and Wild Draw 4
      if (card.value === 'draw2' || card.value === 'wild_draw4') {
        const drawCount = card.value === 'draw2' ? 2 : 4;
        
        console.log(`Player will draw ${drawCount} cards from ${card.value}`);
        
        // Get next player's hand
        const nextHandResult = await db.query(
          `SELECT cards FROM hands WHERE game_id = $1 AND user_id = $2`,
          [gameId, nextPlayer]
        );
        
        if (nextHandResult.rows.length > 0) {
          let nextHand = nextHandResult.rows[0].cards;
          let currentDrawPile = gameState.draw_pile;
          
          console.log(`Next player hand before draw: ${nextHand.length} cards`);
          
          // Draw cards for next player
          for (let i = 0; i < drawCount; i++) {
            if (currentDrawPile.length === 0) {
              // Reshuffle if needed
              const discardPile = gameState.discard_pile;
              const topCard = discardPile.pop();
              currentDrawPile = discardPile;
              shuffleDeck(currentDrawPile);
              gameState.discard_pile = [topCard];
            }
            
            if (currentDrawPile.length > 0) {
              nextHand.push(currentDrawPile.shift());
            }
          }
          
          console.log(`Next player hand after draw: ${nextHand.length} cards`);
          
          // Update next player's hand
          await db.query(
            `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
            [JSON.stringify(nextHand), gameId, nextPlayer]
          );
          
          console.log(`Updated database with ${nextHand.length} cards for player ${nextPlayer}`);
          
          // Update draw pile
          gameState.draw_pile = currentDrawPile;
          
          // Skip the player who drew cards - advance to the player after them
          const skippedPlayerIndex = playerIds.indexOf(nextPlayer);
          let nextIndex;
          if (newDirection === 'clockwise') {
            nextIndex = (skippedPlayerIndex + 1) % playerIds.length;
          } else {
            nextIndex = (skippedPlayerIndex - 1 + playerIds.length) % playerIds.length;
          }
          const playerAfterSkipped = playerIds[nextIndex];
          
          // Emit notification about the skip
          io.to(`game_${gameId}`).emit('player_skipped', {
            userId: nextPlayer,
            cardsDrawn: drawCount,
            cardsLeft: nextHand.length,
            message: `Player drew ${drawCount} cards and was skipped`
          });
          
          // Update nextPlayer to be the one after the skipped player
          nextPlayer = playerAfterSkipped;
        }
      }
      
      // Update game state
      await db.query(
        `UPDATE game_state SET current_player = $1, discard_pile = $2, direction = $3, draw_pile = $4, updated_at = NOW()
         WHERE game_id = $5`,
        [nextPlayer, JSON.stringify(newDiscardPile), newDirection, JSON.stringify(gameState.draw_pile), gameId]
      );
      
      // Check for winner
      if (hand.length === 0) {
        await db.query(`UPDATE games SET state = 'finished' WHERE id = $1`, [gameId]);
        
        const winnerResult = await db.query(`SELECT username FROM users WHERE id = $1`, [userId]);
        const winnerName = winnerResult.rows[0]?.username || 'Unknown';
        
        io.to(`game_${gameId}`).emit('game_finished', {
          winner: userId,
          winnerName: winnerName,
          message: 'Game Over!'
        });
        
        // Clear turn timer for finished game
        clearTurnTimer(gameId);
        
        // Auto-delete the game after 30 seconds
        deleteFinishedGame(gameId, 30000);
      } else {
        // Broadcast move to all players
        const cardAction = card.value === 'draw2' ? 'Draw 2' : 
                          card.value === 'wild_draw4' ? 'Wild Draw 4' :
                          card.value === 'skip' ? 'Skip' :
                          card.value === 'reverse' ? 'Reverse' : '';
        
        io.to(`game_${gameId}`).emit('card_played', {
          userId,
          card,
          nextPlayer,
          cardsLeft: hand.length,
          specialAction: cardAction
        });
        
        // Clear current turn timer and start new one for next player
        clearTurnTimer(gameId);
        startTurnTimer(gameId, nextPlayer, io);
        
        // Check if next player is AI
        const nextPlayerResult = await db.query(
          `SELECT username FROM users WHERE id = $1 AND username LIKE 'AI_Player_%'`,
          [nextPlayer]
        );
        
        if (nextPlayerResult.rows.length > 0) {
          // Next player is AI, trigger their move
          setTimeout(() => makeAIMove(gameId, nextPlayer, io), 2000);
        }
      }
    } catch (error) {
      console.error('Error playing card:', error);
      socket.emit('error', { message: 'Error playing card' });
    }
  });
  
  socket.on('draw_card', async (data) => {
    try {
      const { gameId, userId } = data;
      
      // Get game state
      const stateResult = await db.query(
        `SELECT * FROM game_state WHERE game_id = $1`,
        [gameId]
      );
      
      if (stateResult.rows.length === 0) {
        socket.emit('error', { message: 'Game state not found' });
        return;
      }
      
      const gameState = stateResult.rows[0];
      
      if (gameState.current_player !== userId) {
        socket.emit('error', { message: 'Not your turn!' });
        return;
      }
      
      let drawPile = gameState.draw_pile;
      
      // If draw pile is empty, reshuffle discard pile
      if (drawPile.length === 0) {
        const discardPile = gameState.discard_pile;
        const topCard = discardPile.pop();
        drawPile = discardPile;
        shuffleDeck(drawPile);
        
        await db.query(
          `UPDATE game_state SET discard_pile = $1, draw_pile = $2 WHERE game_id = $3`,
          [JSON.stringify([topCard]), JSON.stringify(drawPile), gameId]
        );
      }
      
      const drawnCard = drawPile.shift();
      
      // Update draw pile
      await db.query(
        `UPDATE game_state SET draw_pile = $1, updated_at = NOW() WHERE game_id = $2`,
        [JSON.stringify(drawPile), gameId]
      );
      
      // Add card to player's hand
      const handResult = await db.query(
        `SELECT cards FROM hands WHERE game_id = $1 AND user_id = $2`,
        [gameId, userId]
      );
      
      let hand = handResult.rows[0].cards;
      hand.push(drawnCard);
      
      await db.query(
        `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
        [JSON.stringify(hand), gameId, userId]
      );
      
      socket.emit('card_drawn', { card: drawnCard });
      io.to(`game_${gameId}`).emit('player_drew_card', { 
        userId,
        cardsLeft: hand.length 
      });
      
      // Advance turn to next player after drawing
      const playersResult = await db.query(
        `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY joined_at`,
        [gameId]
      );
      const playerIds = playersResult.rows.map(r => r.user_id);
      const currentIndex = playerIds.indexOf(userId);
      let nextIndex;
      if (gameState.direction === 'clockwise') {
        nextIndex = (currentIndex + 1) % playerIds.length;
      } else {
        nextIndex = (currentIndex - 1 + playerIds.length) % playerIds.length;
      }
      const nextPlayer = playerIds[nextIndex];
      
      await db.query(
        `UPDATE game_state SET current_player = $1, updated_at = NOW() WHERE game_id = $2`,
        [nextPlayer, gameId]
      );
      
      // Notify clients about turn change
      io.to(`game_${gameId}`).emit('turn_changed', { 
        currentPlayer: nextPlayer 
      });
      
      // Clear current turn timer and start new one for next player
      clearTurnTimer(gameId);
      startTurnTimer(gameId, nextPlayer, io);
      
      // Check if next player is AI
      const nextPlayerResult = await db.query(
        `SELECT username FROM users WHERE id = $1 AND username LIKE 'AI_Player_%'`,
        [nextPlayer]
      );
      
      if (nextPlayerResult.rows.length > 0) {
        setTimeout(() => makeAIMove(gameId, nextPlayer, io), 2000);
      }
    } catch (error) {
      console.error('Error drawing card:', error);
      socket.emit('error', { message: 'Error drawing card' });
    }
  });
  
  socket.on('send_message', async (data) => {
    try {
      const { gameId, message } = data;
      
      // Get user from session
      const session = socket.request.session;
      let userId = session?.userId;
      
      // If no session user, get or create guest
      if (!userId) {
        const guestUser = await getOrCreateGuestUser();
        userId = guestUser.id;
      }
      
      console.log('Socket send_message:', { gameId, userId, message });
      
      if (!message || !message.trim()) {
        console.log('Empty message, ignoring');
        return;
      }
      
      await db.query(
        `INSERT INTO messages (user_id, game_id, message, created_at) VALUES ($1, $2, $3, NOW())`,
        [userId, gameId || null, message.trim()]
      );
      
      // Update game activity timestamp if this is a game message
      if (gameId) {
        await db.query(
          `UPDATE game_state SET updated_at = NOW() WHERE game_id = $1`,
          [gameId]
        );
      }
      
      const userResult = await db.query(`SELECT username FROM users WHERE id = $1`, [userId]);
      const username = userResult.rows[0]?.username || 'Unknown';
      
      const messageData = {
        username,
        message: message.trim(),
        created_at: new Date().toLocaleString()
      };
      
      if (gameId) {
        io.to(`game_${gameId}`).emit('new_message', messageData);
      } else {
        io.emit('new_message', messageData);
      }
      
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Game helper functions
function createDeck() {
  const deck = [];
  const colors = ['red', 'yellow', 'green', 'blue'];
  const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const actions = ['skip', 'reverse', 'draw2'];
  
  // Number cards (2 of each except 0)
  colors.forEach(color => {
    deck.push({ color, value: '0' });
    numbers.slice(1).forEach(num => {
      deck.push({ color, value: num });
      deck.push({ color, value: num });
    });
  });
  
  // Action cards (2 of each per color)
  colors.forEach(color => {
    actions.forEach(action => {
      deck.push({ color, value: action });
      deck.push({ color, value: action });
    });
  });
  
  // Wild cards (4 of each)
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild_draw4' });
  }
  
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function canPlayCard(card, topCard) {
  // Wild cards can always be played
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild_draw4') return true;
  if (card.color === topCard.color) return true;
  if (card.value === topCard.value) return true;
  return false;
}

// Convert card value to display symbol
function getCardSymbol(value) {
  const symbols = {
    'skip': '⊘',
    'reverse': '⇄',
    'draw2': '+2',
    'wild': '🌈',
    'wild_draw4': '🌈+4'
  };
  return symbols[value] || value;
}

function getNextPlayer(playerIds, currentPlayerId, direction, playedCard) {
  const currentIndex = playerIds.indexOf(currentPlayerId);
  let offset = 1;
  
  // Skip next player if skip card
  if (playedCard.value === 'skip') {
    offset = 2;
  }
  
  let nextIndex;
  if (direction === 'clockwise') {
    nextIndex = (currentIndex + offset) % playerIds.length;
  } else {
    nextIndex = (currentIndex - offset + playerIds.length) % playerIds.length;
  }
  
  return playerIds[nextIndex];
}

// Delete a finished game after a short delay
async function deleteFinishedGame(gameId, delay = 30000) {
  try {
    // Wait for the specified delay (default 30 seconds) to give players time to see the results
    await new Promise(resolve => setTimeout(resolve, delay));
    
    console.log(`Auto-deleting finished game ${gameId}...`);
    
    // Delete all related data
    await db.query('DELETE FROM hands WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM game_state WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM messages WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM game_players WHERE game_id = $1', [gameId]);
    await db.query('DELETE FROM games WHERE id = $1', [gameId]);
    
    console.log(`Successfully deleted finished game ${gameId}`);
  } catch (error) {
    console.error(`Error deleting finished game ${gameId}:`, error);
  }
}

// Turn Timer Functions
function startTurnTimer(gameId, playerId, io) {
  // Clear any existing timer for this game
  clearTurnTimer(gameId);
  
  // Don't set timer for AI players
  if (!playerId) return;
  
  // Check if player is AI
  db.query('SELECT username FROM users WHERE id = $1', [playerId])
    .then(result => {
      if (result.rows.length > 0 && result.rows[0].username.startsWith('AI_Player_')) {
        return; // Don't set timer for AI
      }
      
      // Set timeout for human players
      turnTimers[gameId] = setTimeout(() => {
        console.log(`Turn timeout for game ${gameId}, player ${playerId}`);
        handleTurnTimeout(gameId, playerId, io);
      }, TURN_TIMEOUT);
      
      console.log(`Turn timer started for game ${gameId}, player ${playerId}`);
    })
    .catch(err => console.error('Error checking player type:', err));
}

function clearTurnTimer(gameId) {
  if (turnTimers[gameId]) {
    clearTimeout(turnTimers[gameId]);
    delete turnTimers[gameId];
    console.log(`Turn timer cleared for game ${gameId}`);
  }
}

async function handleTurnTimeout(gameId, playerId, io) {
  try {
    console.log(`Handling turn timeout for game ${gameId}, player ${playerId}`);
    
    // Get game state
    const stateResult = await db.query(
      `SELECT * FROM game_state WHERE game_id = $1`,
      [gameId]
    );
    
    if (stateResult.rows.length === 0) {
      console.log('Game state not found, skipping timeout');
      return;
    }
    const gameState = stateResult.rows[0];
    
    // Verify it's still this player's turn
    if (gameState.current_player !== playerId) {
      console.log(`Player ${playerId} is no longer current player (current: ${gameState.current_player}), skipping timeout`);
      return;
    }
    
    // Get player info
    const playerResult = await db.query(`SELECT username FROM users WHERE id = $1`, [playerId]);
    const playerName = playerResult.rows[0]?.username || 'Unknown';
    
    console.log(`Forcing timeout for ${playerName} (${playerId})`);
    
    // Force player to draw a card
    let drawPile = gameState.draw_pile;
    
    if (drawPile.length === 0) {
      const discardPile = gameState.discard_pile;
      const topCard = discardPile.pop();
      drawPile = discardPile;
      shuffleDeck(drawPile);
      
      await db.query(
        `UPDATE game_state SET discard_pile = $1, draw_pile = $2 WHERE game_id = $3`,
        [JSON.stringify([topCard]), JSON.stringify(drawPile), gameId]
      );
    }
    
    const drawnCard = drawPile.shift();
    
    // Update draw pile
    await db.query(
      `UPDATE game_state SET draw_pile = $1, updated_at = NOW() WHERE game_id = $2`,
      [JSON.stringify(drawPile), gameId]
    );
    
    // Add card to player's hand
    const handResult = await db.query(
      `SELECT cards FROM hands WHERE game_id = $1 AND user_id = $2`,
      [gameId, playerId]
    );
    
    let hand = handResult.rows[0].cards;
    hand.push(drawnCard);
    
    await db.query(
      `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
      [JSON.stringify(hand), gameId, playerId]
    );
    
    // Advance turn to next player
    const playersResult = await db.query(
      `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY joined_at`,
      [gameId]
    );
    const playerIds = playersResult.rows.map(r => r.user_id);
    const currentIndex = playerIds.indexOf(playerId);
    let nextIndex;
    if (gameState.direction === 'clockwise') {
      nextIndex = (currentIndex + 1) % playerIds.length;
    } else {
      nextIndex = (currentIndex - 1 + playerIds.length) % playerIds.length;
    }
    const nextPlayer = playerIds[nextIndex];
    
    await db.query(
      `UPDATE game_state SET current_player = $1, updated_at = NOW() WHERE game_id = $2`,
      [nextPlayer, gameId]
    );
    
    // Notify all players
    io.to(`game_${gameId}`).emit('player_turn_timeout', {
      userId: playerId,
      username: playerName,
      cardsLeft: hand.length,
      message: `${playerName}'s turn timed out - drew a card and turn skipped`
    });
    
    io.to(`game_${gameId}`).emit('turn_changed', { 
      currentPlayer: nextPlayer 
    });
    
    // Start timer for next player
    startTurnTimer(gameId, nextPlayer, io);
    
    // Check if next player is AI
    const nextPlayerResult = await db.query(
      `SELECT username FROM users WHERE id = $1 AND username LIKE 'AI_Player_%'`,
      [nextPlayer]
    );
    
    if (nextPlayerResult.rows.length > 0) {
      setTimeout(() => makeAIMove(gameId, nextPlayer, io), 2000);
    }
  } catch (error) {
    console.error('Error handling turn timeout:', error);
  }
}

// AI Player Logic
async function makeAIMove(gameId, aiUserId, io) {
  try {
    console.log(`AI Player ${aiUserId} is thinking...`);
    
    // Clear the timer for this AI player since they're making a move
    clearTurnTimer(gameId);
    
    // Small delay to simulate thinking
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get game state
    const stateResult = await db.query(
      `SELECT * FROM game_state WHERE game_id = $1`,
      [gameId]
    );
    
    if (stateResult.rows.length === 0) return;
    const gameState = stateResult.rows[0];
    
    // Get AI's hand
    const handResult = await db.query(
      `SELECT cards FROM hands WHERE game_id = $1 AND user_id = $2`,
      [gameId, aiUserId]
    );
    
    if (handResult.rows.length === 0) return;
    let hand = handResult.rows[0].cards;
    
    const topCard = gameState.discard_pile[gameState.discard_pile.length - 1];
    
    // Find playable cards
    const playableCards = hand.filter(card => canPlayCard(card, topCard));
    
    if (playableCards.length > 0) {
      // AI strategy: prefer action cards, then matching color, then wild
      const actionCards = playableCards.filter(c => ['skip', 'reverse', 'draw2', 'wild_draw4'].includes(c.value));
      const colorMatch = playableCards.filter(c => c.color === topCard.color && c.color !== 'wild');
      const wilds = playableCards.filter(c => c.color === 'wild');
      
      let cardToPlay;
      if (actionCards.length > 0) {
        cardToPlay = actionCards[0];
      } else if (colorMatch.length > 0) {
        cardToPlay = colorMatch[0];
      } else {
        cardToPlay = playableCards[0];
      }
      
      // If it's a wild card, AI needs to choose a color
      if (cardToPlay.value === 'wild' || cardToPlay.value === 'wild_draw4') {
        // Choose color based on what AI has most of in hand
        const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
        hand.forEach(card => {
          if (card.color in colorCounts) {
            colorCounts[card.color]++;
          }
        });
        
        // Pick the color with most cards
        const bestColor = Object.keys(colorCounts).reduce((a, b) => 
          colorCounts[a] > colorCounts[b] ? a : b
        );
        
        cardToPlay = { ...cardToPlay, color: bestColor };
      }
      
      // Remove card from hand
      const cardIndex = hand.findIndex(c => c.color === cardToPlay.color && c.value === cardToPlay.value);
      hand.splice(cardIndex, 1);
      
      // Update hand
      await db.query(
        `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
        [JSON.stringify(hand), gameId, aiUserId]
      );
      
      // Update discard pile
      const newDiscardPile = [...gameState.discard_pile, cardToPlay];
      
      // Handle reverse card first (before calculating next player)
      let newDirection = gameState.direction;
      if (cardToPlay.value === 'reverse') {
        newDirection = gameState.direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
      }
      
      // Get players and next player (using the new direction if reversed)
      const playersResult = await db.query(
        `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY joined_at`,
        [gameId]
      );
      const playerIds = playersResult.rows.map(r => r.user_id);
      let nextPlayer = getNextPlayer(playerIds, aiUserId, newDirection, cardToPlay);
      
      // Handle Draw 2 and Wild Draw 4
      if (cardToPlay.value === 'draw2' || cardToPlay.value === 'wild_draw4') {
        const drawCount = cardToPlay.value === 'draw2' ? 2 : 4;
        
        const nextHandResult = await db.query(
          `SELECT cards FROM hands WHERE game_id = $1 AND user_id = $2`,
          [gameId, nextPlayer]
        );
        
        if (nextHandResult.rows.length > 0) {
          let nextHand = nextHandResult.rows[0].cards;
          let currentDrawPile = gameState.draw_pile;
          
          for (let i = 0; i < drawCount; i++) {
            if (currentDrawPile.length === 0) {
              const discardPile = gameState.discard_pile;
              const topCardTemp = discardPile.pop();
              currentDrawPile = discardPile;
              shuffleDeck(currentDrawPile);
              gameState.discard_pile = [topCardTemp];
            }
            
            if (currentDrawPile.length > 0) {
              nextHand.push(currentDrawPile.shift());
            }
          }
          
          await db.query(
            `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
            [JSON.stringify(nextHand), gameId, nextPlayer]
          );
          
          gameState.draw_pile = currentDrawPile;
          
          // Skip the player who drew cards - advance to the player after them
          const skippedPlayerIndex = playerIds.indexOf(nextPlayer);
          let nextIndex;
          if (newDirection === 'clockwise') {
            nextIndex = (skippedPlayerIndex + 1) % playerIds.length;
          } else {
            nextIndex = (skippedPlayerIndex - 1 + playerIds.length) % playerIds.length;
          }
          const playerAfterSkipped = playerIds[nextIndex];
          
          // Emit notification about the skip
          io.to(`game_${gameId}`).emit('player_skipped', {
            userId: nextPlayer,
            cardsDrawn: drawCount,
            cardsLeft: nextHand.length,
            message: `Player drew ${drawCount} cards and was skipped`
          });
          
          // Update nextPlayer to be the one after the skipped player
          nextPlayer = playerAfterSkipped;
        }
      }
      
      // Update game state
      await db.query(
        `UPDATE game_state SET current_player = $1, discard_pile = $2, direction = $3, draw_pile = $4, updated_at = NOW()
         WHERE game_id = $5`,
        [nextPlayer, JSON.stringify(newDiscardPile), newDirection, JSON.stringify(gameState.draw_pile), gameId]
      );
      
      // Check for AI win
      if (hand.length === 0) {
        await db.query(`UPDATE games SET state = 'finished' WHERE id = $1`, [gameId]);
        
        const aiResult = await db.query(`SELECT username FROM users WHERE id = $1`, [aiUserId]);
        const aiName = aiResult.rows[0]?.username || 'AI';
        
        io.to(`game_${gameId}`).emit('game_finished', {
          winner: aiUserId,
          winnerName: aiName,
          message: 'Game Over!'
        });
        
        // Clear turn timer for finished game
        clearTurnTimer(gameId);
        
        // Auto-delete the game after 30 seconds
        deleteFinishedGame(gameId, 30000);
      } else {
        // Broadcast AI's move
        const cardAction = cardToPlay.value === 'draw2' ? 'Draw 2' : 
                          cardToPlay.value === 'wild_draw4' ? 'Wild Draw 4' :
                          cardToPlay.value === 'skip' ? 'Skip' :
                          cardToPlay.value === 'reverse' ? 'Reverse' : '';
        
        io.to(`game_${gameId}`).emit('card_played', {
          userId: aiUserId,
          card: cardToPlay,
          nextPlayer,
          cardsLeft: hand.length,
          specialAction: cardAction
        });
        
        // Clear current turn timer and start new one for next player
        clearTurnTimer(gameId);
        startTurnTimer(gameId, nextPlayer, io);
        
        // Check if next player is also AI
        const nextPlayerResult = await db.query(
          `SELECT username FROM users WHERE id = $1 AND username LIKE 'AI_Player_%'`,
          [nextPlayer]
        );
        
        if (nextPlayerResult.rows.length > 0) {
          // Next player is AI, schedule their move
          setTimeout(() => makeAIMove(gameId, nextPlayer, io), 2000);
        }
      }
    } else {
      // AI must draw a card
      let drawPile = gameState.draw_pile;
      
      if (drawPile.length === 0) {
        const discardPile = gameState.discard_pile;
        const topCardTemp = discardPile.pop();
        drawPile = discardPile;
        shuffleDeck(drawPile);
        
        await db.query(
          `UPDATE game_state SET discard_pile = $1, draw_pile = $2 WHERE game_id = $3`,
          [JSON.stringify([topCardTemp]), JSON.stringify(drawPile), gameId]
        );
      }
      
      const drawnCard = drawPile.shift();
      hand.push(drawnCard);
      
      await db.query(
        `UPDATE hands SET cards = $1, updated_at = NOW() WHERE game_id = $2 AND user_id = $3`,
        [JSON.stringify(hand), gameId, aiUserId]
      );
      
      await db.query(
        `UPDATE game_state SET draw_pile = $1, updated_at = NOW() WHERE game_id = $2`,
        [JSON.stringify(drawPile), gameId]
      );
      
      // Get next player
      const playersResult = await db.query(
        `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY joined_at`,
        [gameId]
      );
      const playerIds = playersResult.rows.map(r => r.user_id);
      const currentIndex = playerIds.indexOf(aiUserId);
      let nextIndex;
      if (gameState.direction === 'clockwise') {
        nextIndex = (currentIndex + 1) % playerIds.length;
      } else {
        nextIndex = (currentIndex - 1 + playerIds.length) % playerIds.length;
      }
      const nextPlayer = playerIds[nextIndex];
      
      await db.query(
        `UPDATE game_state SET current_player = $1 WHERE game_id = $2`,
        [nextPlayer, gameId]
      );
      
      io.to(`game_${gameId}`).emit('player_drew_card', { 
        userId: aiUserId,
        cardsLeft: hand.length 
      });
      
      // Notify clients about turn change
      io.to(`game_${gameId}`).emit('turn_changed', { 
        currentPlayer: nextPlayer 
      });
      
      // Clear current turn timer and start new one for next player
      clearTurnTimer(gameId);
      startTurnTimer(gameId, nextPlayer, io);
      
      // Check if next player is also AI
      const nextPlayerResult = await db.query(
        `SELECT username FROM users WHERE id = $1 AND username LIKE 'AI_Player_%'`,
        [nextPlayer]
      );
      
      if (nextPlayerResult.rows.length > 0) {
        setTimeout(() => makeAIMove(gameId, nextPlayer, io), 2000);
      }
    }
  } catch (error) {
    console.error('Error in AI move:', error);
  }
}

// Auto-delete inactive games
async function deleteInactiveGames() {
  try {
    console.log('Checking for inactive games...');
    
    // Find games that have been inactive for more than 2 minutes
    // For waiting games: check created_at
    // For active games: check game_state.updated_at
    const inactiveGamesQuery = `
      SELECT DISTINCT g.id, g.name, g.state, g.created_by, u.username as creator_name,
             COALESCE(gs.updated_at, g.created_at) as last_activity
      FROM games g
      LEFT JOIN game_state gs ON g.id = gs.game_id
      LEFT JOIN users u ON g.created_by = u.id
      WHERE g.state != 'finished'
        AND COALESCE(gs.updated_at, g.created_at) < NOW() - INTERVAL '2 minutes'
    `;
    
    const result = await db.query(inactiveGamesQuery);
    
    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} inactive game(s) to delete`);
      
      for (const game of result.rows) {
        console.log(`Auto-deleting inactive game ${game.id} (${game.name}) - last activity: ${game.last_activity}`);
        
        // Notify all players in the game
        io.to(`game_${game.id}`).emit('game_deleted', {
          message: 'This game has been automatically deleted due to 2 minutes of inactivity',
          creatorName: game.creator_name || 'System',
          autoDeleted: true
        });
        
        // Delete all related data
        await db.query('DELETE FROM hands WHERE game_id = $1', [game.id]);
        await db.query('DELETE FROM game_state WHERE game_id = $1', [game.id]);
        await db.query('DELETE FROM messages WHERE game_id = $1', [game.id]);
        await db.query('DELETE FROM game_players WHERE game_id = $1', [game.id]);
        await db.query('DELETE FROM games WHERE id = $1', [game.id]);
        
        console.log(`Successfully deleted inactive game ${game.id}`);
      }
    } else {
      console.log('No inactive games found');
    }
  } catch (error) {
    console.error('Error deleting inactive games:', error);
  }
}

// Run inactive game cleanup every minute
setInterval(deleteInactiveGames, 60000); // 60000ms = 1 minute

// Run once on startup (after a short delay to ensure DB is ready)
setTimeout(deleteInactiveGames, 5000); // 5 seconds after startup

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Make sure to run migrations: npm run migrate:up`);
  console.log(`Auto-delete inactive games: enabled (2 minute timeout)`);
});
