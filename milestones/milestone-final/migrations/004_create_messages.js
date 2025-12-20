'use strict';

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.createTable('messages', {
    id: { type: 'serial', primaryKey: true, notNull: true },
    user_id: { type: 'integer', notNull: true },
    game_id: { type: 'integer' },
    message: { type: 'text', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') }
  });
  
  pgm.addConstraint('messages', 'messages_user_id_fk', {
    foreignKeys: {
      columns: 'user_id',
      references: 'users(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.addConstraint('messages', 'messages_game_id_fk', {
    foreignKeys: {
      columns: 'game_id',
      references: 'games(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.createIndex('messages', 'user_id', { name: 'messages_user_id_idx' });
  pgm.createIndex('messages', 'game_id', { name: 'messages_game_id_idx' });
  pgm.createIndex('messages', 'created_at', { name: 'messages_created_at_idx' });
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.dropTable('messages');
};
