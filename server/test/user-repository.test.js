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

describe('userRepository: administración de usuarios', () => {
  let database;
  let userRepository;

  before(async () => {
    database = await createTestDatabase();
    userRepository = createUserRepository(database.knex);
  });

  after(() => database.cleanup());

  it('lista los usuarios ordenados por id y sin contraseña', async () => {
    const users = await userRepository.list();
    assert.deepEqual(users.map((user) => user.email), ['empleado@empresa.com', 'admin@empresa.com']);
    for (const user of users) {
      assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'isAdmin', 'name']);
    }
  });

  it('busca por id sin contraseña y devuelve undefined si no existe', async () => {
    const [first] = await userRepository.list();
    const user = await userRepository.findById(first.id);
    assert.equal(user.email, first.email);
    assert.equal('password' in user, false);
    assert.equal(await userRepository.findById(9999), undefined);
  });

  it('crea un usuario y lo devuelve sin contraseña', async () => {
    const created = await userRepository.create({
      name: 'Ana', email: 'ana@empresa.com', password: 'inicial123', isAdmin: false,
    });
    assert.equal(created.email, 'ana@empresa.com');
    assert.equal(typeof created.id, 'number');
    assert.equal('password' in created, false);
    assert.equal((await userRepository.findByEmail('ana@empresa.com')).password, 'inicial123');
  });

  it('rechaza un email repetido con un error de restricción', async () => {
    await assert.rejects(
      userRepository.create({ name: 'Otra', email: 'admin@empresa.com', password: 'inicial123', isAdmin: false }),
      (error) => String(error.code).startsWith('SQLITE_CONSTRAINT'),
    );
  });

  it('renombra y borra indicando si el usuario existía', async () => {
    const { id } = await userRepository.findByEmail('ana@empresa.com');
    assert.equal(await userRepository.rename(id, 'Ana García'), true);
    assert.equal((await userRepository.findById(id)).name, 'Ana García');
    assert.equal(await userRepository.remove(id), true);
    assert.equal(await userRepository.findById(id), undefined);
    assert.equal(await userRepository.rename(id, 'Nadie'), false);
    assert.equal(await userRepository.remove(id), false);
  });
});
