// Game client - handles real-time game interactions
console.log('game.js is loading...');
const socket = io();
console.log('Socket.io initialized');

// Game state
let gameId = null;
let userId = null;
let currentHand = [];
let isMyTurn = false;

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

// Initialize game
function initGame(gId, uId, hand) {
  gameId = gId;
  userId = uId;
  currentHand = hand || [];
  
  // Join game room
  socket.emit('join_game', { gameId, userId });
  
  // Update hand display if we have cards
  if (currentHand.length > 0) {
    updateHandDisplay();
  }
  
  // Initialize current player state from the page
  const gameData = document.getElementById('gameData');
  if (gameData) {
    const currentPlayerId = gameData.getAttribute('data-current-player-id');
    if (currentPlayerId) {
      isMyTurn = (parseInt(currentPlayerId) === userId);
      console.log('Initialized turn state:', { isMyTurn, currentPlayerId, userId });
    }
  }
  
  console.log('Game initialized:', { gameId, userId, handSize: currentHand.length, isMyTurn });
}

// Note: Start game button handler is in the inline script in show.ejs
// to ensure it's attached after the DOM is fully loaded

// Listen for game started event
socket.on('game_started', (data) => {
  console.log('Game started:', data);
  
  // Hide start button
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    startBtn.style.display = 'none';
  }
  
  // Hide add AI button
  const addAIBtn = document.getElementById('addAIBtn');
  if (addAIBtn) {
    addAIBtn.style.display = 'none';
  }
  
  // Hide waiting message
  const waitingMsg = document.querySelector('.game-players + div p');
  if (waitingMsg && waitingMsg.textContent.includes('Waiting for game creator')) {
    waitingMsg.style.display = 'none';
  }
  
  // Show game started message
  addSystemMessage('Game has started! Good luck!');
  
  // Reload page to get updated game state
  setTimeout(() => {
    window.location.reload();
  }, 1000);
});

// Listen for player joined event
socket.on('player_joined', (data) => {
  const message = data.message || `${data.username} joined the game`;
  addSystemMessage(message);
  
  // Reload page to update player list
  setTimeout(() => {
    window.location.reload();
  }, 1000);
});

// Listen for player left event
socket.on('player_left', (data) => {
  console.log('Player left:', data);
  addSystemMessage(data.message);
  
  // Reload page to update player list
  setTimeout(() => {
    window.location.reload();
  }, 1500);
});

// Listen for game deleted event
socket.on('game_deleted', (data) => {
  console.log('Game deleted:', data);
  
  const message = data.autoDeleted 
    ? data.message 
    : `${data.message} by ${data.creatorName}`;
  
  alert(message);
  window.location.href = '/lobby';
});

// Play card functionality
function playCard(cardIndex) {
  if (!isMyTurn) {
    showNotification('Not your turn!', 'error');
    return;
  }
  
  const card = currentHand[cardIndex];
  if (!card) {
    showNotification('Invalid card!', 'error');
    return;
  }
  
  // Check if it's a wild card - if so, show color picker
  if (card.value === 'wild' || card.value === 'wild_draw4') {
    showColorPicker(card, cardIndex);
  } else {
    socket.emit('play_card', { gameId, userId, card });
  }
}

// Show color picker modal for wild cards
function showColorPicker(card, cardIndex) {
  const modal = document.getElementById('colorPickerModal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  
  // Add event listeners to color buttons
  const colorButtons = modal.querySelectorAll('.color-choice-btn');
  colorButtons.forEach(btn => {
    btn.onclick = () => {
      const chosenColor = btn.getAttribute('data-color');
      modal.style.display = 'none';
      
      // Create new card object with chosen color
      const cardWithColor = { ...card, color: chosenColor };
      
      socket.emit('play_card', { gameId, userId, card: cardWithColor });
    };
  });
}

// Listen for card played event
socket.on('card_played', (data) => {
  console.log('Card played:', data);
  
  // Update UI
  if (data.userId === userId) {
    // Remove card from hand
    const cardIndex = currentHand.findIndex(c => c.color === data.card.color && c.value === data.card.value);
    if (cardIndex !== -1) {
      currentHand.splice(cardIndex, 1);
      updateHandDisplay();
    }
  }
  
  // Update discard pile
  updateDiscardPile(data.card);
  
  // Update current player
  updateCurrentPlayer(data.nextPlayer);
  
  // Update player card count
  if (data.userId !== userId) {
    updatePlayerCardCount(data.userId, data.cardsLeft);
  }
  
  // Show notification with special action
  const username = getPlayerUsername(data.userId);
  let message = `${username} played a ${data.card.color} ${data.card.value}`;
  
  if (data.specialAction) {
    message += ` - ${data.specialAction}!`;
  }
  
  showNotification(message, 'info');
  
  // Reload if you were affected by Draw 2/4
  if (data.nextPlayer === userId && (data.card.value === 'draw2' || data.card.value === 'wild_draw4')) {
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }
});

// Draw card functionality
function drawCard() {
  if (!isMyTurn) {
    showNotification('Not your turn!', 'error');
    return;
  }
  
  socket.emit('draw_card', { gameId, userId });
}

// Listen for card drawn event
socket.on('card_drawn', (data) => {
  console.log('Card drawn:', data);
  
  // Add card to hand
  currentHand.push(data.card);
  updateHandDisplay();
  
  showNotification('You drew a card', 'success');
});

// Listen for player drew card event
socket.on('player_drew_card', (data) => {
  if (data.userId !== userId) {
    const username = getPlayerUsername(data.userId);
    showNotification(`${username} drew a card`, 'info');
    
    // Update their card count
    if (data.cardsLeft) {
      updatePlayerCardCount(data.userId, data.cardsLeft);
    }
  }
});

// Listen for game finished event
socket.on('game_finished', (data) => {
  console.log('Game finished:', data);
  
  const username = data.winnerName || getPlayerUsername(data.winner);
  showNotification(`🎉 ${username} wins the game! 🎉`, 'success');
  
  // Show game over overlay
  setTimeout(() => {
    if (confirm(`${username} has won the game! Return to lobby?`)) {
      window.location.href = '/lobby';
    }
  }, 2000);
});

// Error handling
socket.on('error', (data) => {
  console.error('Socket error:', data);
  showNotification(data.message || 'An error occurred', 'error');
});

// Chat functionality
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Send message (userId will be determined from session on server)
    socket.emit('send_message', { gameId, message });
    chatInput.value = '';
  });
}

// Listen for new messages
socket.on('new_message', (data) => {
  if (chatMessages) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    // Add icon based on username
    let icon = '';
    if (data.username.startsWith('AI_Player_')) {
      icon = '🤖 ';
    } else if (data.username.startsWith('guest_')) {
      icon = '👤 ';
    }
    
    messageDiv.innerHTML = `
      <strong>${icon}${escapeHtml(data.username)}</strong>
      <span style="color:#6b7280; font-size:0.85rem; margin-left:0.5rem;">${data.created_at}</span>
      <div>${escapeHtml(data.message)}</div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

// UI Helper functions
function updateHandDisplay() {
  const handContainer = document.querySelector('.hand-cards');
  if (!handContainer) return;
  
  handContainer.innerHTML = '';
  
  currentHand.forEach((card, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.className = `uno-card card-${card.color}`;
    const displayValue = getCardSymbol(card.value);
    cardDiv.innerHTML = `<div class="uno-value">${displayValue}</div>`;
    cardDiv.onclick = () => playCard(index);
    handContainer.appendChild(cardDiv);
  });
}

function updateDiscardPile(card) {
  const discardPile = document.querySelector('.discard-pile');
  if (!discardPile) return;
  
  const displayValue = getCardSymbol(card.value);
  discardPile.innerHTML = `
    <div class="uno-card card-${card.color}" style="width:100px; height:140px;">
      <div class="uno-value" style="font-size:1.5rem;">${displayValue}</div>
    </div>
  `;
}

function updateCurrentPlayer(playerId) {
  isMyTurn = (playerId === userId);
  
  const currentPlayerEl = document.querySelector('.current-player-name');
  if (currentPlayerEl) {
    const username = getPlayerUsername(playerId);
    
    // Add icon based on username
    let icon = '';
    if (username.startsWith('AI_Player_')) {
      icon = '<span style="font-size: 1.1rem;">🤖</span> ';
    } else if (username.startsWith('guest_')) {
      icon = '<span style="font-size: 1.1rem;">👤</span> ';
    }
    
    currentPlayerEl.innerHTML = icon + username;
  }
  
  // Highlight player cards if it's their turn
  document.querySelectorAll('.player-card').forEach(card => {
    card.classList.remove('active');
  });
  
  const activePlayerCard = document.querySelector(`[data-player-id="${playerId}"]`);
  if (activePlayerCard) {
    activePlayerCard.classList.add('active');
  }
  
  // Update turn indicator
  if (isMyTurn) {
    showNotification("It's your turn!", 'success');
    enableCardSelection();
  } else {
    disableCardSelection();
  }
}

function updatePlayerCardCount(playerId, count) {
  const playerCard = document.querySelector(`[data-player-id="${playerId}"] .player-cards`);
  if (playerCard) {
    playerCard.textContent = `${count} cards`;
  }
}

function getPlayerUsername(playerId) {
  const playerCard = document.querySelector(`[data-player-id="${playerId}"]`);
  if (playerCard) {
    const nameEl = playerCard.querySelector('.player-name');
    return nameEl ? nameEl.textContent : 'Unknown';
  }
  return 'Unknown';
}

function enableCardSelection() {
  document.querySelectorAll('.uno-card').forEach(card => {
    card.classList.add('playable');
  });
}

function disableCardSelection() {
  document.querySelectorAll('.uno-card').forEach(card => {
    card.classList.remove('playable');
  });
}

function addSystemMessage(message) {
  if (chatMessages) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message system-message';
    messageDiv.innerHTML = `
      <strong style="color: #667eea;">System</strong>
      <div>${escapeHtml(message)}</div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Make showNotification available globally for inline scripts
window.showNotification = showNotification;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Draw card button
const drawButton = document.getElementById('drawCardBtn');
if (drawButton) {
  drawButton.addEventListener('click', drawCard);
}

// Auto-scroll chat to bottom
if (chatMessages) {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

console.log('Game client initialized');
