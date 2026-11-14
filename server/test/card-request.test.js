import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CIPHERTEXT_LENGTHS,
  WRAPPED_KEY_LENGTH,
  parseCardId,
  parseCreateCardRequest,
  parseUpdateCardRequest,
} from '../src/infrastructure/http/card-request.js';

const ID = 'b6f1c2de-0000-4000-8000-000000000001';

function base64Of(length, fill = 7) {
  return Buffer.alloc(length, fill).toString('base64');
}

function value(field, fill = 7) {
  return { iv: base64Of(12, fill), ciphertext: base64Of(CIPHERTEXT_LENGTHS[field], fill) };
}

function validBody() {
  return {
    id: ID,
    number: value('number'),
    expiry: value('expiry'),
    cvv: value('cvv'),
    wrappedKey: base64Of(WRAPPED_KEY_LENGTH),
  };
}

describe('parseCreateCardRequest', () => {
  it('acepta un cuerpo cifrado válido y normaliza el id a minúsculas', () => {
    const body = { ...validBody(), id: ID.toUpperCase() };
    assert.deepEqual(parseCreateCardRequest(body), { ...validBody(), id: ID });
  });

  it('no comprueba el contenido: cualquier base64 de los tamaños correctos vale', () => {
    assert.ok(parseCreateCardRequest({ ...validBody(), number: value('number', 255) }));
  });

  it('rechaza lo que no es un objeto con exactamente los cinco campos', () => {
    const { wrappedKey, ...withoutKey } = validBody();
    for (const body of [null, 'texto', ['a'], {}, withoutKey, { ...validBody(), userId: 1 }, { ...validBody(), last4: '1111' }]) {
      assert.equal(parseCreateCardRequest(body), null, JSON.stringify(body));
    }
  });

  it('rechaza un id que no es un UUID v4', () => {
    for (const id of ['123', '', 12, 'b6f1c2de-0000-1000-8000-000000000001', `${ID}x`]) {
      assert.equal(parseCreateCardRequest({ ...validBody(), id }), null, String(id));
    }
  });

  it('rechaza cifrados de tamaño incorrecto', () => {
    for (const field of ['number', 'expiry', 'cvv']) {
      const short = { iv: base64Of(12), ciphertext: base64Of(CIPHERTEXT_LENGTHS[field] - 1) };
      const long = { iv: base64Of(12), ciphertext: base64Of(CIPHERTEXT_LENGTHS[field] + 1) };
      assert.equal(parseCreateCardRequest({ ...validBody(), [field]: short }), null, `${field} corto`);
      assert.equal(parseCreateCardRequest({ ...validBody(), [field]: long }), null, `${field} largo`);
    }
  });

  it('rechaza vectores que no miden 12 bytes', () => {
    const bad = { ...value('cvv'), iv: base64Of(16) };
    assert.equal(parseCreateCardRequest({ ...validBody(), cvv: bad }), null);
  });

  it('rechaza base64 ilegible o con tamaño que no cuadra', () => {
    for (const wrappedKey of ['no-es-base64!', base64Of(255), base64Of(257), `${base64Of(255)}A`, 42]) {
      assert.equal(parseCreateCardRequest({ ...validBody(), wrappedKey }), null, String(wrappedKey));
    }
    const bad = { ...value('number'), ciphertext: 'abc' };
    assert.equal(parseCreateCardRequest({ ...validBody(), number: bad }), null);
  });

  it('rechaza un valor con campos de más o de menos', () => {
    assert.equal(parseCreateCardRequest({ ...validBody(), cvv: { ...value('cvv'), plain: '123' } }), null);
    assert.equal(parseCreateCardRequest({ ...validBody(), cvv: { iv: base64Of(12) } }), null);
    assert.equal(parseCreateCardRequest({ ...validBody(), cvv: 'texto' }), null);
  });
});

describe('parseUpdateCardRequest', () => {
  it('devuelve solo los valores enviados', () => {
    const expiry = value('expiry', 9);
    assert.deepEqual(parseUpdateCardRequest({ expiry }), { expiry });
    const number = value('number', 3);
    const cvv = value('cvv', 4);
    assert.deepEqual(parseUpdateCardRequest({ number, cvv }), { number, cvv });
  });

  it('rechaza un cuerpo vacío, no objeto o con campos no admitidos', () => {
    for (const body of [{}, null, [], 'x', { id: ID, cvv: value('cvv') }, { wrappedKey: base64Of(256) }, { cvv: value('cvv'), userId: 1 }]) {
      assert.equal(parseUpdateCardRequest(body), null, JSON.stringify(body));
    }
  });

  it('rechaza un valor con tamaño incorrecto aunque los demás sean válidos', () => {
    const bad = { iv: base64Of(12), ciphertext: base64Of(CIPHERTEXT_LENGTHS.cvv + 1) };
    assert.equal(parseUpdateCardRequest({ number: value('number'), cvv: bad }), null);
  });
});

describe('parseCardId', () => {
  it('acepta un UUID y lo normaliza a minúsculas', () => {
    assert.equal(parseCardId(ID.toUpperCase()), ID);
  });

  it('rechaza lo que no es un UUID', () => {
    for (const id of ['123', '', undefined, 'b6f1c2de-0000-4000-8000-00000000000']) {
      assert.equal(parseCardId(id), null, String(id));
    }
  });
});
