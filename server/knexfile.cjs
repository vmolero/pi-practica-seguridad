const { join } = require('node:path');

module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: join(__dirname, 'data', 'app.sqlite'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: join(__dirname, 'migrations'),
      extension: 'cjs',
      loadExtensions: ['.cjs'],
    },
  },
};