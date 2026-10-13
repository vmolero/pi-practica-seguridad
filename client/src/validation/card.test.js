import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_MESSAGES, formatExpiry, passesLuhn, validateCardForm } from './card.js';

// Fecha fija: 15 de octubre de 2026.
const NOW = new Date(2026, 9, 15);
const VALID = { number: '4111 1111 1111 1111', expiryMonth: '12', expiryYear: '2030', cvv: '123' };

const create = (overrides) => validateCardForm({ ...VALID, ...overrides }, NOW);
const edit = (values) => validateCardForm(
  { number: '', expiryMonth: '', expiryYear: '', cvv: '', ...values },
  NOW,
  { partial: true },
);

// Misma tabla de casos que server/test/card-request.test.js.
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

describe('validateCardForm (alta)', () => {
  it('normaliza un alta válida quitando espacios y guiones', () => {
    assert.deepEqual(create(), {
      errors: {},
      data: { number: '4111111111111111', expiryMonth: 12, expiryYear: 2030, cvv: '123' },
    });
    assert.equal(create({ number: '5555-5555-5555-4444' }).data.number, '5555555555554444');
    assert.equal(create({ number: '378282246310005', cvv: '1234' }).data.cvv, '1234');
  });

  it('rechaza números que no superan Luhn, de longitud incorrecta o con letras', () => {
    for (const number of ['4111111111111112', '411111111111', '41111111111111111111', '4111 1111 1111 111a', '']) {
      assert.equal(create({ number }).errors.number, CARD_MESSAGES.number, number);
    }
  });

  it('rechaza meses fuera de 1–12 y años de dos cifras o demasiado lejanos', () => {
    for (const expiry of [
      { expiryMonth: '0' }, { expiryMonth: '13' }, { expiryMonth: '6.5' }, { expiryMonth: '' },
      { expiryYear: '30' }, { expiryYear: '2047' }, { expiryYear: '' },
    ]) {
      assert.equal(create(expiry).errors.expiry, CARD_MESSAGES.expiry, JSON.stringify(expiry));
    }
    assert.deepEqual(create({ expiryYear: '2046' }).errors, {});
  });

  it('rechaza una tarjeta caducada el mes pasado y acepta la que caduca este mes', () => {
    assert.equal(create({ expiryMonth: '9', expiryYear: '2026' }).errors.expiry, CARD_MESSAGES.expired);
    assert.equal(create({ expiryMonth: '12', expiryYear: '2025' }).errors.expiry, CARD_MESSAGES.expired);
    assert.deepEqual(create({ expiryMonth: '10', expiryYear: '2026' }).errors, {});
  });

  it('rechaza CVV de 2 o 5 dígitos o con letras', () => {
    for (const cvv of ['12', '12345', '12a', '']) {
      assert.equal(create({ cvv }).errors.cvv, CARD_MESSAGES.cvv, cvv);
    }
  });
});

describe('validateCardForm (edición)', () => {
  it('devuelve solo los campos rellenados', () => {
    assert.deepEqual(edit({ expiryMonth: '6', expiryYear: '2031' }), {
      errors: {},
      data: { expiryMonth: 6, expiryYear: 2031 },
    });
    assert.deepEqual(edit({ number: '5555 5555 5555 4444' }).data, { number: '5555555555554444' });
    assert.deepEqual(edit({ cvv: '999' }).data, { cvv: '999' });
  });

  it('pide al menos un cambio', () => {
    assert.equal(edit({}).errors.form, CARD_MESSAGES.noChanges);
  });

  it('exige el mes y el año de caducidad juntos', () => {
    assert.equal(edit({ expiryMonth: '3' }).errors.expiry, CARD_MESSAGES.expiryIncomplete);
    assert.equal(edit({ expiryYear: '2031' }).errors.expiry, CARD_MESSAGES.expiryIncomplete);
  });

  it('aplica a cada campo rellenado las mismas reglas que el alta', () => {
    assert.equal(edit({ number: '4111111111111112' }).errors.number, CARD_MESSAGES.number);
    assert.equal(edit({ expiryMonth: '9', expiryYear: '2026' }).errors.expiry, CARD_MESSAGES.expired);
    assert.equal(edit({ cvv: '12a' }).errors.cvv, CARD_MESSAGES.cvv);
  });
});

describe('formatExpiry', () => {
  it('devuelve MM/AA', () => {
    assert.equal(formatExpiry(3, 2030), '03/30');
    assert.equal(formatExpiry(12, 2031), '12/31');
  });
});
