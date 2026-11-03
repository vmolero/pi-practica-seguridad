import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestDatabase } from './helpers.js';

const KEY_COLUMNS = ['publicKey', 'encryptedPrivateKey', 'privateKeyIv'];

async function userColumns(knex) {
  const info = await knex('USER').columnInfo();
  return Object.keys(info);
}

describe('conexión a SQLite', () => {
  let database;

  before(async () => {
    database = await createTestDatabase();
  });

  after(() => database.cleanup());

  it('activa las claves foráneas', async () => {
    const [row] = await database.knex.raw('PRAGMA foreign_keys');
    assert.equal(row.foreign_keys, 1);
  });
});

describe('migración de las claves del usuario', () => {
  let database;

  before(async () => {
    database = await createTestDatabase();
  });

  after(() => database.cleanup());

  it('añade las tres columnas de clave a USER', async () => {
    const columns = await userColumns(database.knex);
    for (const column of KEY_COLUMNS) assert.ok(columns.includes(column), column);
  });

  it('conserva las filas anteriores con las columnas a NULL y el rollback las quita', async () => {
    const { knex } = database;

    // Deshace solo esta migración: USER vuelve a no tener las columnas.
    await knex.migrate.down();
    const before = await userColumns(knex);
    for (const column of KEY_COLUMNS) assert.equal(before.includes(column), false, column);

    // Un usuario creado antes del cambio.
    await knex('USER').insert({ name: 'Antiguo', email: 'antiguo@empresa.com', password: 'x', isAdmin: false });

    await knex.migrate.up();
    const user = await knex('USER').where({ email: 'antiguo@empresa.com' }).first();
    assert.equal(user.name, 'Antiguo');
    for (const column of KEY_COLUMNS) assert.equal(user[column], null, column);
  });
});
