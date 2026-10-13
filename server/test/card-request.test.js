import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCardId,
  parseCreateCardRequest,
  parseUpdateCardRequest,
  passesLuhn,
} from '../src/infrastructure/http/card-request.js';

// Fecha fija: 15 de octubre de 2026.
const NOW = new Date(2026, 9, 15);
const VALID = { number: '4111 1111 1111 1111', expiryMonth: 12, expiryYear: 2030, cvv: '123' };

const create = (overrides) => parseCreateCardRequest({ ...VALID, ...overrides }, { now: NOW });
const update = (body) => parseUpdateCardRequest(body, { now: NOW });

// Misma tabla de casos que client/src/validation/card.test.js.
const LUHN_CASES = [
  ['4111111111111111', true], // Visa de prueba
  ['5555555555554444', true], // Mastercard de prueba
  ['378282246310005', true], // Amex de prueba
  ['4111111111111112', false],
  ['5555555555554445', false],
  ['378282246310006', false],
];

describe('passesLuhn', () => {
  for (const [number, expected] of LUHN_CASES) {
    it(`${number} → ${expected}`, () => {
      assert.equal(passesLuhn(number), expected);
    });
  }
});

describe('parseCreateCardRequest', () => {
  it('normaliza un alta válida quitando espacios y guiones', () => {
    assert.deepEqual(create(), { number: '4111111111111111', expiryMonth: 12, expiryYear: 2030, cvv: '123' });
    assert.equal(create({ number: '5555-5555-5555-4444' }).number, '5555555555554444');
    assert.equal(create({ number: '378282246310005', cvv: '1234' }).cvv, '1234');
  });

  it('rechaza números que no superan Luhn, de longitud incorrecta o con letras', () => {
    for (const number of ['4111111111111112', '411111111111', '41111111111111111111', '4111 1111 1111 111a', 4111111111111111]) {
      assert.equal(create({ number }), null, String(number));
    }
  });

  it('rechaza meses fuera de 1–12 y años de dos cifras o demasiado lejanos', () => {
    for (const expiry of [
      { expiryMonth: 0 }, { expiryMonth: 13 }, { expiryMonth: '12' }, { expiryMonth: 6.5 },
      { expiryYear: 30 }, { expiryYear: 2047 }, { expiryYear: '2030' },
    ]) {
      assert.equal(create(expiry), null, JSON.stringify(expiry));
    }
    assert.ok(create({ expiryYear: 2046 }));
  });

  it('rechaza una tarjeta caducada el mes pasado y acepta la que caduca este mes', () => {
    assert.equal(create({ expiryMonth: 9, expiryYear: 2026 }), null);
    assert.equal(create({ expiryMonth: 12, expiryYear: 2025 }), null);
    assert.ok(create({ expiryMonth: 10, expiryYear: 2026 }));
  });

  it('rechaza CVV de 2 o 5 dígitos, con letras o numérico', () => {
    for (const cvv of ['12', '12345', '12a', 123]) {
      assert.equal(create({ cvv }), null, String(cvv));
    }
  });

  it('rechaza campos extra, campos ausentes y cuerpos que no son objeto', () => {
    assert.equal(create({ userId: 2 }), null);
    const { cvv: _cvv, ...withoutCvv } = VALID;
    assert.equal(parseCreateCardRequest(withoutCvv, { now: NOW }), null);
    for (const body of [null, undefined, 'tarjeta', [VALID], 42]) {
      assert.equal(parseCreateCardRequest(body, { now: NOW }), null);
    }
  });
});

describe('parseUpdateCardRequest', () => {
  it('devuelve solo los campos enviados, normalizados', () => {
    assert.deepEqual(update({ expiryMonth: 6, expiryYear: 2031 }), { expiryMonth: 6, expiryYear: 2031 });
    assert.deepEqual(update({ number: '5555 5555 5555 4444' }), { number: '5555555555554444' });
    assert.deepEqual(update({ cvv: '999' }), { cvv: '999' });
    assert.deepEqual(update(VALID), create());
  });

  it('rechaza un cuerpo vacío o que no es objeto', () => {
    for (const body of [{}, null, 'x', []]) {
      assert.equal(update(body), null);
    }
  });

  it('exige el mes y el año de caducidad juntos', () => {
    assert.equal(update({ expiryMonth: 3 }), null);
    assert.equal(update({ expiryYear: 2031 }), null);
  });

  it('aplica a cada campo las mismas reglas que el alta', () => {
    assert.equal(update({ number: '4111111111111112' }), null);
    assert.equal(update({ expiryMonth: 9, expiryYear: 2026 }), null);
    assert.equal(update({ cvv: '12a' }), null);
    assert.equal(update({ userId: 2 }), null);
    assert.equal(update({ cvv: '123', userId: 2 }), null);
  });
});

describe('parseCardId', () => {
  it('acepta un UUID y rechaza cualquier otro formato', () => {
    assert.equal(parseCardId('B6F1C2DE-0000-4000-8000-000000000001'), 'b6f1c2de-0000-4000-8000-000000000001');
    for (const id of ['123', 'abc', '', undefined, 'b6f1c2de-0000-4000-8000-00000000000']) {
      assert.equal(parseCardId(id), null, String(id));
    }
  });
});
