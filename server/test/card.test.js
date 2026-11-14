import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnsOf, toCard, toEncryptedCard } from '../src/domain/card.js';

const ROW = {
  id: 'b6f1c2de-0000-4000-8000-000000000001',
  numberIv: 'iv-num',
  numberCiphertext: 'c-num',
  expiryIv: 'iv-exp',
  expiryCiphertext: 'c-exp',
  cvvIv: 'iv-cvv',
  cvvCiphertext: 'c-cvv',
  wrappedKey: 'w-u',
  isOwner: 1,
  createdAt: '2026-10-14T09:00:00.000Z',
  updatedAt: '2026-10-14T09:00:00.000Z',
};

describe('toCard', () => {
  it('agrupa cada valor cifrado con su vector y convierte isOwner a booleano', () => {
    assert.deepEqual(toCard(ROW), {
      id: ROW.id,
      number: { iv: 'iv-num', ciphertext: 'c-num' },
      expiry: { iv: 'iv-exp', ciphertext: 'c-exp' },
      cvv: { iv: 'iv-cvv', ciphertext: 'c-cvv' },
      wrappedKey: 'w-u',
      isOwner: true,
      createdAt: ROW.createdAt,
      updatedAt: ROW.updatedAt,
    });
  });

  it('columnsOf da las dos columnas de cada valor', () => {
    assert.deepEqual(columnsOf('expiry'), { iv: 'expiryIv', ciphertext: 'expiryCiphertext' });
  });
});

describe('toEncryptedCard', () => {
  it('devuelve los valores cifrados y la clave envuelta, sin isOwner ni updatedAt', () => {
    const card = toCard(ROW);
    assert.deepEqual(toEncryptedCard(card), {
      id: ROW.id,
      number: card.number,
      expiry: card.expiry,
      cvv: card.cvv,
      wrappedKey: 'w-u',
      createdAt: ROW.createdAt,
    });
  });
});
