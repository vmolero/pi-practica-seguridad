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

    // Deshace la migración de las tarjetas cifradas (paso 10), la de la clave
    // de login (paso 8) y después esta: USER vuelve a no tener las columnas
    // de clave y a tener password.
    await knex.migrate.down();
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

    // Vuelve a aplicar las del paso 8 y el paso 10 para dejar el esquema completo.
    await knex.migrate.up();
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

    // Deshace primero la de las tarjetas cifradas (paso 10) y después esta.
    await knex.migrate.down();
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
    await knex.migrate.up();
  });
});

describe('migración a tarjetas cifradas (paso 10)', () => {
  let database;

  before(async () => {
    database = await createTestDatabase();
  });

  after(() => database.cleanup());

  const columnsOf = async (knex, table) => Object.keys(await knex(table).columnInfo());

  it('CARD tiene las columnas cifradas y no las de texto claro; USER_CARD exige wrappedKey', async () => {
    const { knex } = database;
    const card = await columnsOf(knex, 'CARD');
    for (const column of ['numberIv', 'numberCiphertext', 'expiryIv', 'expiryCiphertext', 'cvvIv', 'cvvCiphertext']) {
      assert.ok(card.includes(column), column);
    }
    for (const column of ['number', 'expiryMonth', 'expiryYear', 'cvv']) assert.equal(card.includes(column), false, column);
    const info = await knex('USER_CARD').columnInfo();
    assert.ok(info.wrappedKey);
    assert.equal(info.wrappedKey.nullable, false);
  });

  it('vacía las tarjetas en claro del paso 5 y deja USER intacto; el rollback restaura las columnas', async () => {
    const { knex } = database;
    const usersBefore = await knex('USER').orderBy('id');

    await knex.migrate.down();
    const before = await columnsOf(knex, 'CARD');
    assert.ok(before.includes('number'));
    assert.equal(before.includes('numberCiphertext'), false);
    assert.equal((await columnsOf(knex, 'USER_CARD')).includes('wrappedKey'), false);

    // Una tarjeta en claro, como las del paso 5.
    await knex('CARD').insert({ id: 'a0000000-0000-4000-8000-000000000001', number: '4111111111111111', expiryMonth: 12, expiryYear: 2030, cvv: '123' });
    await knex('USER_CARD').insert({ userId: usersBefore[0].id, cardId: 'a0000000-0000-4000-8000-000000000001', isOwner: true });

    await knex.migrate.up();
    assert.deepEqual(await knex('CARD'), []);
    assert.deepEqual(await knex('USER_CARD'), []);
    assert.ok((await columnsOf(knex, 'CARD')).includes('numberCiphertext'));
    assert.deepEqual(await knex('USER').orderBy('id'), usersBefore);
  });

  it('la tarjeta de la semilla se descifra con la clave privada del empleado', async () => {
    const { abrirClavePrivada } = await import('../../client/src/security/claves-usuario.js');
    const { descifrarTarjeta } = await import('../../client/src/security/tarjetas-cifradas.js');
    const { knex } = database;
    await knex.seed.run();

    const employee = await knex('USER').where({ email: 'empleado@empresa.com' }).first();
    const row = await knex('CARD').first();
    const relation = await knex('USER_CARD').where({ cardId: row.id, userId: employee.id }).first();
    const k_U = await abrirClavePrivada('demo1234', employee);
    const card = await descifrarTarjeta(k_U, {
      id: row.id,
      number: { iv: row.numberIv, ciphertext: row.numberCiphertext },
      expiry: { iv: row.expiryIv, ciphertext: row.expiryCiphertext },
      cvv: { iv: row.cvvIv, ciphertext: row.cvvCiphertext },
      wrappedKey: relation.wrappedKey,
    });
    assert.deepEqual(card, { id: row.id, number: '4111111111111111', expiry: '12/2030', cvv: '123' });
  });
});
