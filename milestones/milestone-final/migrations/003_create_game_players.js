'use strict';

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.createTable('game_players', {
    game_id: { type: 'integer', notNull: true },
    user_id: { type: 'integer', notNull: true },
    joined_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') }
  });
  
  pgm.addConstraint('game_players', 'game_players_game_id_fk', {
    foreignKeys: {
      columns: 'game_id',
      references: 'games(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.addConstraint('game_players', 'game_players_user_id_fk', {
    foreignKeys: {
      columns: 'user_id',
      references: 'users(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.addConstraint('game_players', 'game_players_unique', {
    unique: ['game_id', 'user_id']
  });
  
  pgm.createIndex('game_players', 'game_id', { name: 'game_players_game_id_idx' });
  pgm.createIndex('game_players', 'user_id', { name: 'game_players_user_id_idx' });
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.dropTable('game_players');
};
