'use strict';

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'serial', primaryKey: true, notNull: true },
    username: { type: 'varchar(50)', notNull: true, unique: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') }
  });
  
  pgm.createIndex('users', 'username', { name: 'users_username_idx' });
  pgm.createIndex('users', 'email', { name: 'users_email_idx' });
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.dropTable('users');
};

