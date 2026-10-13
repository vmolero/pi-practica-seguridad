const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const dataDirectory = join(__dirname, 'data');

mkdirSync(dataDirectory, { recursive: true });

module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: join(dataDirectory, 'app.sqlite'),
    },
    useNullAsDefault: true,
    pool: {
      // SQLite ignora las claves foráneas salvo que se activen en cada conexión.
      afterCreate(connection, done) {
        connection.pragma('foreign_keys = ON');
        done(null, connection);
      },
    },
    migrations: {
      directory: join(__dirname, 'migrations'),
      extension: 'cjs',
      loadExtensions: ['.cjs'],
    },
    seeds: {
      directory: join(__dirname, 'seeds'),
      loadExtensions: ['.cjs'],
    },
  },
};