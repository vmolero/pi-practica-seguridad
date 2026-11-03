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

    // Deshace la migración de la clave de login (paso 8) y después esta:
    // USER vuelve a no tener las columnas de clave y a tener password.
    await knex.migrate.down();
    await knex.migrate.down();
    const before = await userColumns(knex);
    for (const column of KEY_COLUMNS) assert.equal(before.includes(column), false, column);
    assert.ok(before.includes('password'));

    // Un usuario creado antes del cambio.
    await knex('USER').insert({ name: 'Antiguo', email: 'antiguo@empresa.com', password: 'x', isAdmin: false });

    await knex.migrate.up();
    const user = await knex('USER').where({ email: 'antiguo@empresa.com' }).first();
    assert.equal(user.name, 'Antiguo');
    assert.equal(user.password, 'x');
    for (const column of KEY_COLUMNS) assert.equal(user[column], null, column);

    // Vuelve a aplicar la del paso 8 para dejar el esquema completo.
    await knex.migrate.up();
    for (const column of KEY_COLUMNS) assert.ok((await userColumns(knex)).includes(column), column);
  });
});

describe('migración de la clave de login (sustituye a password)', () => {
  let database;

  before(async () => {
    database = await createTestDatabase();
  });

  after(() => database.cleanup());

  it('tras migrar no existe password y existen loginKeySalt y loginKeyHash', async () => {
    const columns = await userColumns(database.knex);
    assert.equal(columns.includes('password'), false);
    assert.ok(columns.includes('loginKeySalt'));
    assert.ok(columns.includes('loginKeyHash'));
  });

  it('conserva las filas anteriores con NULL y el rollback restaura password', async () => {
    const { knex } = database;

    await knex.migrate.down();
    const before = await userColumns(knex);
    assert.ok(before.includes('password'));
    assert.equal(before.includes('loginKeySalt'), false);
    assert.equal(before.includes('loginKeyHash'), false);

    // Un usuario creado antes del cambio, con contraseña en claro.
    await knex('USER').insert({ name: 'Antiguo', email: 'antiguo@empresa.com', password: 'x', isAdmin: false });

    await knex.migrate.up();
    const user = await knex('USER').where({ email: 'antiguo@empresa.com' }).first();
    assert.equal(user.name, 'Antiguo');
    assert.equal('password' in user, false);
    assert.equal(user.loginKeySalt, null);
    assert.equal(user.loginKeyHash, null);
  });
});
