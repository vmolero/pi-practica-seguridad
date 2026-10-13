import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestDatabase } from './helpers.js';

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
