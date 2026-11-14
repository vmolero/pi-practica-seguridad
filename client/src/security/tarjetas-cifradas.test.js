import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { abrirClavePrivada, fromBase64, generarClavesUsuario, importarClavePublica } from './claves-usuario.js';
import {
  FIELD_LENGTHS,
  TarjetaCifradaError,
  WRAPPED_KEY_LENGTH,
  abrirClaveTarjeta,
  cifrarTarjeta,
  cifrarValores,
  descifrarTarjeta,
} from './tarjetas-cifradas.js';

const ID = '4f1c2a3e-5b6d-4c7e-8f90-a1b2c3d4e5f6';
const CARD = { id: ID, number: '4111111111111111', expiry: '12/2030', cvv: '123' };

// Dos usuarios: el propietario y otro. RSA 2048 tarda, así que una sola vez.
let owner;
let other;

async function userKeys(password) {
  const keys = await generarClavesUsuario(password);
  return {
    publicKey: await importarClavePublica(keys.publicKey),
    privateKey: await abrirClavePrivada(password, keys),
  };
}

function bytes(text) {
  return fromBase64(text).length;
}

function tampered(base64, index = 0) {
  const data = fromBase64(base64);
  data[index] ^= 0x01;
  return btoa(String.fromCharCode(...data));
}

async function rejectsAsDamaged(promise) {
  await assert.rejects(promise, (error) => error instanceof TarjetaCifradaError);
}

before(async () => {
  owner = await userKeys('demo1234');
  other = await userKeys('otra5678');
});

describe('cifrarTarjeta y descifrarTarjeta', () => {
  it('recupera exactamente los valores originales con las claves del propietario', async () => {
    const encrypted = await cifrarTarjeta(owner.publicKey, CARD);
    assert.deepEqual(Object.keys(encrypted).sort(), ['cvv', 'expiry', 'id', 'number', 'wrappedKey']);
    assert.deepEqual(await descifrarTarjeta(owner.privateKey, encrypted), CARD);
  });

  it('produce cifrados de tamaño fijo sea cual sea la longitud del número y del CVV', async () => {
    const short = await cifrarTarjeta(owner.publicKey, { ...CARD, number: '4222222222222', cvv: '123' });
    const long = await cifrarTarjeta(owner.publicKey, { ...CARD, number: '4000000000000000006', cvv: '1234' });
    for (const card of [short, long]) {
      assert.equal(bytes(card.number.ciphertext), FIELD_LENGTHS.number + 16);
      assert.equal(bytes(card.expiry.ciphertext), FIELD_LENGTHS.expiry + 16);
      assert.equal(bytes(card.cvv.ciphertext), FIELD_LENGTHS.cvv + 16);
      assert.equal(bytes(card.number.iv), 12);
      assert.equal(bytes(card.wrappedKey), WRAPPED_KEY_LENGTH);
    }
    assert.equal((await descifrarTarjeta(owner.privateKey, short)).number, '4222222222222');
    assert.equal((await descifrarTarjeta(owner.privateKey, long)).cvv, '1234');
  });

  it('cifra de forma distinta la misma tarjeta dos veces', async () => {
    const first = await cifrarTarjeta(owner.publicKey, CARD);
    const second = await cifrarTarjeta(owner.publicKey, CARD);
    assert.notEqual(first.wrappedKey, second.wrappedKey);
    assert.notEqual(first.number.ciphertext, second.number.ciphertext);
    assert.notEqual(first.number.iv, second.number.iv);
  });

  it('no se abre con la clave privada de otro usuario', async () => {
    const encrypted = await cifrarTarjeta(owner.publicKey, CARD);
    await rejectsAsDamaged(descifrarTarjeta(other.privateKey, encrypted));
    await rejectsAsDamaged(abrirClaveTarjeta(other.privateKey, encrypted.wrappedKey));
  });

  it('detecta un byte alterado en el cifrado o en el vector', async () => {
    const encrypted = await cifrarTarjeta(owner.publicKey, CARD);
    await rejectsAsDamaged(descifrarTarjeta(owner.privateKey, {
      ...encrypted,
      number: { ...encrypted.number, ciphertext: tampered(encrypted.number.ciphertext, 5) },
    }));
    await rejectsAsDamaged(descifrarTarjeta(owner.privateKey, {
      ...encrypted,
      cvv: { ...encrypted.cvv, iv: tampered(encrypted.cvv.iv) },
    }));
    await rejectsAsDamaged(descifrarTarjeta(owner.privateKey, {
      ...encrypted,
      wrappedKey: tampered(encrypted.wrappedKey, 100),
    }));
  });

  it('detecta un valor copiado a otra tarjeta con la misma clave', async () => {
    const encrypted = await cifrarTarjeta(owner.publicKey, CARD);
    const K_t = await abrirClaveTarjeta(owner.privateKey, encrypted.wrappedKey);
    const otherId = 'a0000000-0000-4000-8000-000000000001';
    const otherValues = await cifrarValores(K_t, otherId, { number: '5555555555554444', expiry: '01/2031', cvv: '999' });
    // Misma K_t y mismo wrappedKey, pero el número viene de la tarjeta ID.
    await rejectsAsDamaged(descifrarTarjeta(owner.privateKey, {
      ...otherValues,
      id: otherId,
      wrappedKey: encrypted.wrappedKey,
      number: encrypted.number,
    }));
  });

  it('detecta un valor copiado a otro campo de la misma tarjeta', async () => {
    const encrypted = await cifrarTarjeta(owner.publicKey, CARD);
    await rejectsAsDamaged(descifrarTarjeta(owner.privateKey, { ...encrypted, expiry: encrypted.cvv }));
  });
});

describe('abrirClaveTarjeta y cifrarValores (edición)', () => {
  it('cifra valores nuevos que se descifran con la clave envuelta original', async () => {
    const encrypted = await cifrarTarjeta(owner.publicKey, CARD);
    const K_t = await abrirClaveTarjeta(owner.privateKey, encrypted.wrappedKey);
    assert.equal(K_t.extractable, false);
    assert.deepEqual(K_t.usages.sort(), ['decrypt', 'encrypt']);

    const changes = await cifrarValores(K_t, ID, { expiry: '06/2031' });
    assert.deepEqual(Object.keys(changes), ['expiry']);
    assert.notEqual(changes.expiry.iv, encrypted.expiry.iv);

    const card = await descifrarTarjeta(owner.privateKey, { ...encrypted, ...changes });
    assert.deepEqual(card, { ...CARD, expiry: '06/2031' });
  });
});
