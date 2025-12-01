'use strict';

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.createTable('hands', {
    id: { type: 'serial', primaryKey: true, notNull: true },
    game_id: { type: 'integer', notNull: true },
    user_id: { type: 'integer', notNull: true },
    cards: { type: 'jsonb', notNull: true, default: '[]' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') }
  });
  
  pgm.addConstraint('hands', 'hands_game_id_fk', {
    foreignKeys: {
      columns: 'game_id',
      references: 'games(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.addConstraint('hands', 'hands_user_id_fk', {
    foreignKeys: {
      columns: 'user_id',
      references: 'users(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.addConstraint('hands', 'hands_game_user_unique', {
    unique: ['game_id', 'user_id']
  });
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.dropTable('hands');
};

