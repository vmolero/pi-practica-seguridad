import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createUserRepository } from '../src/infrastructure/database/user-repository.js';
import { createTestDatabase } from './helpers.js';

describe('userRepository.findByEmail', () => {
  let database;
  let userRepository;

  before(async () => {
    database = await createTestDatabase();
    userRepository = createUserRepository(database.knex);
  });

  after(() => database.cleanup());

  it('devuelve el usuario sembrado con su contraseña y su rol', async () => {
    const user = await userRepository.findByEmail('admin@empresa.com');
    assert.equal(user.email, 'admin@empresa.com');
    assert.equal(user.password, 'admin1234');
    assert.equal(Boolean(user.isAdmin), true);
  });

  it('devuelve undefined si el email no existe', async () => {
    assert.equal(await userRepository.findByEmail('nadie@empresa.com'), undefined);
  });
});
