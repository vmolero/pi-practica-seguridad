import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  clearSession,
  getDataKey,
  getToken,
  getUserKeys,
  setDataKey,
  setToken,
  setUserKeys,
} from './session.js';

describe('sesión en memoria', () => {
  beforeEach(() => clearSession());

  it('empieza vacía', () => {
    assert.equal(getToken(), null);
    assert.equal(getDataKey(), null);
    assert.equal(getUserKeys(), null);
  });

  it('devuelve lo guardado', () => {
    const keys = { publicKey: { type: 'public' }, privateKey: { type: 'private' } };
    setToken('jwt');
    setUserKeys(keys);
    assert.equal(getToken(), 'jwt');
    assert.equal(getUserKeys(), keys);
  });

  it('clearSession borra el token, rellena K_D a ceros y suelta las claves', () => {
    const K_D = new Uint8Array(16).fill(9);
    setToken('jwt');
    setDataKey(K_D);
    setUserKeys({ publicKey: {}, privateKey: {} });
    clearSession();
    assert.equal(getToken(), null);
    assert.equal(getDataKey(), null);
    assert.equal(getUserKeys(), null);
    assert.deepEqual(K_D, new Uint8Array(16));
  });
});
