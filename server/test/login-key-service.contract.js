// Batería de contrato del servicio de clave de login (ver src/infrastructure/security/README.md).
// Toda implementación, provisional o del equipo, debe superarla sin modificar este archivo.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

const PEPPER = 'pimienta-de-contrato-de-al-menos-16';
const OTHER_PEPPER = 'otra-pimienta-de-contrato-16-chars';
const KEY = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const OTHER_KEY = Uint8Array.from({ length: 16 }, (_, i) => 16 - i);

function base64Length(text) {
  return Buffer.from(text, 'base64').length;
}

/**
 * @param {(options: { pepper: string }) => { newSalt, hash, verify, fakeSalt }} createService
 */
export function runLoginKeyServiceContractTests(createService) {
  describe('contrato del servicio de clave de login', () => {
    let service;
    let salt;
    let digest;

    before(async () => {
      service = createService({ pepper: PEPPER });
      salt = service.newSalt();
      digest = await service.hash(KEY, salt);
    });

    it('newSalt devuelve 16 bytes aleatorios en base64, distintos cada vez', () => {
      const other = service.newSalt();
      assert.equal(base64Length(salt), 16);
      assert.equal(base64Length(other), 16);
      assert.notEqual(salt, other);
    });

    it('hash es determinista para la misma clave, sal y pimienta', async () => {
      assert.equal(await service.hash(KEY, salt), digest);
      assert.equal(await createService({ pepper: PEPPER }).hash(KEY, salt), digest);
    });

    it('hash devuelve base64 y no contiene la clave en claro', () => {
      assert.match(digest, /^[A-Za-z0-9+/]+={0,2}$/);
      assert.equal(digest.includes(Buffer.from(KEY).toString('base64')), false);
    });

    it('hash cambia al cambiar la sal', async () => {
      assert.notEqual(await service.hash(KEY, service.newSalt()), digest);
    });

    it('hash cambia al cambiar la clave', async () => {
      assert.notEqual(await service.hash(OTHER_KEY, salt), digest);
    });

    it('hash cambia al cambiar la pimienta', async () => {
      assert.notEqual(await createService({ pepper: OTHER_PEPPER }).hash(KEY, salt), digest);
    });

    it('verify acepta solo la clave correcta con su sal y su pimienta', async () => {
      assert.equal(await service.verify(KEY, salt, digest), true);
      assert.equal(await service.verify(OTHER_KEY, salt, digest), false);
      assert.equal(await service.verify(KEY, service.newSalt(), digest), false);
      assert.equal(await createService({ pepper: OTHER_PEPPER }).verify(KEY, salt, digest), false);
    });

    it('verify devuelve false ante un hash de otra longitud o mal formado', async () => {
      assert.equal(await service.verify(KEY, salt, digest.slice(0, 8)), false);
      assert.equal(await service.verify(KEY, salt, ''), false);
      assert.equal(await service.verify(KEY, salt, `${digest}AAAA`), false);
    });

    it('rechaza con TypeError una clave que no es un Uint8Array de 16 bytes', async () => {
      for (const bad of [new Uint8Array(15), new Uint8Array(17), 'clave', null, Buffer.from(KEY).toString('base64')]) {
        await assert.rejects(service.hash(bad, salt), TypeError);
        await assert.rejects(service.verify(bad, salt, digest), TypeError);
      }
    });

    it('fakeSalt es determinista por email, distinta entre emails y de 16 bytes', () => {
      const first = service.fakeSalt('nadie@empresa.com');
      assert.equal(first, service.fakeSalt('nadie@empresa.com'));
      assert.equal(first, createService({ pepper: PEPPER }).fakeSalt('nadie@empresa.com'));
      assert.notEqual(first, service.fakeSalt('otro@empresa.com'));
      assert.equal(base64Length(first), 16);
    });

    it('fakeSalt sirve como sal para hash y verify', async () => {
      const fake = service.fakeSalt('nadie@empresa.com');
      const fakeDigest = await service.hash(KEY, fake);
      assert.equal(await service.verify(KEY, fake, fakeDigest), true);
    });
  });
}
