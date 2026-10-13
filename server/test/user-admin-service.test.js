import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { DuplicateEmailError, SelfDeletionError, UserNotFoundError } from '../src/application/errors.js';
import { createUserAdminService } from '../src/application/user-admin-service.js';

function createInMemoryUserRepository() {
  const users = [
    { id: 1, name: 'Empleado', email: 'empleado@empresa.com', password: 'demo1234', isAdmin: 0 },
    { id: 2, name: 'Admin', email: 'admin@empresa.com', password: 'admin1234', isAdmin: 1 },
  ];
  const calls = { remove: 0 };

  return {
    users,
    calls,
    async list() {
      return users;
    },
    async findByEmail(email) {
      return users.find((user) => user.email === email);
    },
    async findById(id) {
      return users.find((user) => user.id === id);
    },
    async create(data) {
      const user = { id: users.length + 1, ...data };
      users.push(user);
      return user;
    },
    async rename(id, name) {
      const user = users.find((candidate) => candidate.id === id);
      if (user) user.name = name;
      return Boolean(user);
    },
    async remove(id) {
      calls.remove += 1;
      const index = users.findIndex((user) => user.id === id);
      if (index >= 0) users.splice(index, 1);
      return index >= 0;
    },
  };
}

function assertNoPassword(user) {
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'isAdmin', 'name']);
}

describe('userAdminService', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createInMemoryUserRepository();
    service = createUserAdminService({ userRepository: repository });
  });

  it('lista los usuarios sin contraseña', async () => {
    const users = await service.list();
    assert.equal(users.length, 2);
    users.forEach(assertNoPassword);
    assert.equal(users[1].isAdmin, true);
  });

  it('da de alta un usuario y lo devuelve sin contraseña', async () => {
    const created = await service.create({
      name: 'Ana', email: 'ana@empresa.com', password: 'inicial123', isAdmin: false,
    });
    assertNoPassword(created);
    assert.deepEqual(created, { id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: false });
  });

  it('rechaza un email repetido', async () => {
    await assert.rejects(
      service.create({ name: 'Otro', email: 'admin@empresa.com', password: 'inicial123', isAdmin: false }),
      DuplicateEmailError,
    );
    assert.equal(repository.users.length, 2);
  });

  it('traduce la violación del índice único a DuplicateEmailError', async () => {
    repository.create = async () => {
      throw Object.assign(new Error('UNIQUE constraint failed'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    };
    await assert.rejects(
      service.create({ name: 'Ana', email: 'ana@empresa.com', password: 'inicial123', isAdmin: false }),
      DuplicateEmailError,
    );
  });

  it('renombra y devuelve el usuario actualizado sin contraseña', async () => {
    const renamed = await service.rename(1, 'Ana García');
    assertNoPassword(renamed);
    assert.equal(renamed.name, 'Ana García');
  });

  it('lanza UserNotFoundError al renombrar o borrar un usuario inexistente', async () => {
    await assert.rejects(service.rename(9999, 'Nadie'), UserNotFoundError);
    await assert.rejects(service.remove(9999, { actingUserId: 2 }), UserNotFoundError);
  });

  it('borra otro usuario', async () => {
    await service.remove(1, { actingUserId: 2 });
    assert.equal(await repository.findById(1), undefined);
  });

  it('impide que un administrador se borre a sí mismo sin llamar al repositorio', async () => {
    await assert.rejects(service.remove(2, { actingUserId: 2 }), SelfDeletionError);
    assert.equal(repository.calls.remove, 0);
    assert.ok(await repository.findById(2));
  });
});
