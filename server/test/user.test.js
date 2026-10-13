import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toAdminUser } from '../src/domain/user.js';

describe('toAdminUser', () => {
  it('devuelve id, nombre, email y rol booleano, sin contraseña', () => {
    const user = { id: 3, name: 'Ana', email: 'ana@empresa.com', password: 'secreta123', isAdmin: 1 };
    assert.deepEqual(toAdminUser(user), { id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: true });
  });
});
