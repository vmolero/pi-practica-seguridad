import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createUserRepository } from '../src/infrastructure/database/user-repository.js';
import { createTestDatabase, getTestUserKeys } from './helpers.js';

const KEYS = await getTestUserKeys();
const NEW_USER = {
  name: 'Ana', email: 'ana@empresa.com', isAdmin: false, loginKeySalt: 'c2FsLWRlLXBydWViYQ==', loginKeyHash: 'aGFzaC1kZS1wcnVlYmE=', ...KEYS,
};

describe('userRepository.findByEmail', () => {
  let database;
  let userRepository;

  before(async () => {
    database = await createTestDatabase();
    userRepository = createUserRepository(database.knex);
  });

  after(() => database.cleanup());

  it('devuelve el usuario sembrado con la sal y el hash de su clave de login, sus claves y su rol', async () => {
    const user = await userRepository.findByEmail('admin@empresa.com');
    assert.equal(user.email, 'admin@empresa.com');
    assert.deepEqual(Object.keys(user).sort(), [
      'email', 'encryptedPrivateKey', 'id', 'isAdmin', 'loginKeyHash', 'loginKeySalt', 'name', 'privateKeyIv', 'publicKey',
    ]);
    assert.equal(Buffer.from(user.loginKeySalt, 'base64').length, 16);
    assert.ok(user.loginKeyHash.length > 0);
    assert.equal(Buffer.from(user.privateKeyIv, 'base64').length, 16);
    assert.ok(user.publicKey.length > 0);
    assert.ok(user.encryptedPrivateKey.length > 0);
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

  it('crea un usuario con su sal, su hash y sus claves, y lo devuelve sin nada de eso', async () => {
    const created = await userRepository.create(NEW_USER);
    assert.equal(created.email, 'ana@empresa.com');
    assert.equal(typeof created.id, 'number');
    assert.deepEqual(Object.keys(created).sort(), ['email', 'id', 'isAdmin', 'name']);
    // findByEmail devuelve la sal y el hash (para el login) y nada de contraseña.
    const found = await userRepository.findByEmail('ana@empresa.com');
    assert.equal(found.loginKeySalt, NEW_USER.loginKeySalt);
    assert.equal(found.loginKeyHash, NEW_USER.loginKeyHash);
    assert.equal(found.publicKey, KEYS.publicKey);
    assert.equal(found.encryptedPrivateKey, KEYS.encryptedPrivateKey);
    assert.equal(found.privateKeyIv, KEYS.privateKeyIv);
    assert.equal('password' in found, false);
    // La fila guarda exactamente los valores enviados.
    const row = await database.knex('USER').where({ email: 'ana@empresa.com' }).first();
    assert.equal(row.loginKeySalt, NEW_USER.loginKeySalt);
    assert.equal(row.loginKeyHash, NEW_USER.loginKeyHash);
    assert.equal(row.publicKey, KEYS.publicKey);
    assert.equal(row.encryptedPrivateKey, KEYS.encryptedPrivateKey);
    assert.equal(row.privateKeyIv, KEYS.privateKeyIv);
  });

  it('rechaza un email repetido con un error de restricción', async () => {
    await assert.rejects(
      userRepository.create({ ...NEW_USER, name: 'Otra', email: 'admin@empresa.com' }),
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
