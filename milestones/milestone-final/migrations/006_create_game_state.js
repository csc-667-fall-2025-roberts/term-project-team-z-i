'use strict';

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.createTable('game_state', {
    id: { type: 'serial', primaryKey: true, notNull: true },
    game_id: { type: 'integer', notNull: true, unique: true },
    current_player: { type: 'integer' },
    discard_pile: { type: 'jsonb', notNull: true, default: '[]' },
    draw_pile: { type: 'jsonb', notNull: true, default: '[]' },
    direction: { type: 'varchar(10)', notNull: true, default: 'clockwise' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') }
  });
  
  pgm.addConstraint('game_state', 'game_state_game_id_fk', {
    foreignKeys: {
      columns: 'game_id',
      references: 'games(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.addConstraint('game_state', 'game_state_current_player_fk', {
    foreignKeys: {
      columns: 'current_player',
      references: 'users(id)',
      onDelete: 'SET NULL',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.createIndex('game_state', 'game_id', { name: 'game_state_game_id_idx' });
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.dropTable('game_state');
};
