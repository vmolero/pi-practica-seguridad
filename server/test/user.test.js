import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toAdminUser } from '../src/domain/user.js';

describe('toAdminUser', () => {
  it('devuelve id, nombre, email y rol booleano, sin sal, hash ni claves', () => {
    const user = {
      id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: 1,
      loginKeySalt: 'c2Fs', loginKeyHash: 'aGFzaA==', publicKey: 'cGs=', encryptedPrivateKey: 'Y2s=', privateKeyIv: 'aXY=',
    };
    assert.deepEqual(toAdminUser(user), { id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: true });
  });
});
