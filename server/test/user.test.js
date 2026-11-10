import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toAdminUser, toUserKeys } from '../src/domain/user.js';

describe('toAdminUser', () => {
  it('devuelve id, nombre, email y rol booleano, sin sal, hash ni claves', () => {
    const user = {
      id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: 1,
      loginKeySalt: 'c2Fs', loginKeyHash: 'aGFzaA==', publicKey: 'cGs=', encryptedPrivateKey: 'Y2s=', privateKeyIv: 'aXY=',
    };
    assert.deepEqual(toAdminUser(user), { id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: true });
  });
});

describe('toUserKeys', () => {
  const user = {
    id: 3, name: 'Ana', email: 'ana@empresa.com', isAdmin: 1,
    loginKeySalt: 'c2Fs', loginKeyHash: 'aGFzaA==', publicKey: 'cGs=', encryptedPrivateKey: 'Y2s=', privateKeyIv: 'aXY=',
  };

  it('devuelve solo la clave pública, el VI y la clave privada cifrada', () => {
    assert.deepEqual(toUserKeys(user), { publicKey: 'cGs=', privateKeyIv: 'aXY=', encryptedPrivateKey: 'Y2s=' });
  });

  it('devuelve null si falta cualquiera de los tres', () => {
    for (const field of ['publicKey', 'privateKeyIv', 'encryptedPrivateKey']) {
      assert.equal(toUserKeys({ ...user, [field]: null }), null, field);
    }
  });
});
