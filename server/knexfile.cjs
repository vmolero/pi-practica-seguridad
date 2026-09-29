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
    migrations: {
      directory: join(__dirname, 'migrations'),
      extension: 'cjs',
      loadExtensions: ['.cjs'],
    },
  },
};