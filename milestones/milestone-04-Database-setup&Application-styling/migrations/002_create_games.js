'use strict';

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.createTable('games', {
    id: { type: 'serial', primaryKey: true, notNull: true },
    name: { type: 'varchar(100)', notNull: true },
    created_by: { type: 'integer', notNull: true },
    state: { type: 'varchar(20)', notNull: true, default: 'waiting' },
    max_players: { type: 'integer', notNull: true, default: 4 },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') }
  });
  
  pgm.addConstraint('games', 'games_created_by_fk', {
    foreignKeys: {
      columns: 'created_by',
      references: 'users(id)',
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  });
  
  pgm.createIndex('games', 'created_by', { name: 'games_created_by_idx' });
  pgm.createIndex('games', 'state', { name: 'games_state_idx' });
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.dropTable('games');
};

