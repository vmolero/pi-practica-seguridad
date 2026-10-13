// Batería de contrato del servicio de tokens (ver src/infrastructure/security/README.md).
// Toda implementación, provisional o del equipo, debe superarla sin modificar este archivo.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvalidTokenError } from '../src/application/errors.js';

export const CONTRACT_ISSUER = 'tarjetas-de-empresa';
const TTL_SECONDS = 60;
const CLAIMS = { sub: '7', email: 'ana@empresa.com', name: 'Ana', isAdmin: false };

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * @param {object} factories
 * @param {(options: { now?: () => number, ttlSeconds: number, issuer: string }) => { sign, verify }} factories.createService
 *   Crea servicios que comparten siempre las mismas claves.
 * @param {(options: { now?: () => number, ttlSeconds: number, issuer: string }) => { sign, verify }} factories.createServiceWithOtherKey
 *   Crea un servicio con claves distintas de las de createService.
 */
export function runTokenServiceContractTests({ createService, createServiceWithOtherKey }) {
  const options = { ttlSeconds: TTL_SECONDS, issuer: CONTRACT_ISSUER };

  describe('contrato del servicio de tokens', () => {
    it('ida y vuelta: verify devuelve los claims con iss, iat y exp = iat + ttl', async () => {
      const service = createService(options);
      const token = await service.sign(CLAIMS);
      const claims = await service.verify(token);

      assert.equal(token.split('.').length, 3);
      assert.deepEqual(
        { sub: claims.sub, email: claims.email, name: claims.name, isAdmin: claims.isAdmin },
        CLAIMS,
      );
      assert.equal(claims.iss, CONTRACT_ISSUER);
      assert.equal(typeof claims.iat, 'number');
      assert.equal(claims.exp, claims.iat + TTL_SECONDS);
    });

    it('iat sale del reloj inyectado', async () => {
      const fixedMs = Date.UTC(2026, 9, 13, 12, 0, 0);
      const service = createService({ ...options, now: () => fixedMs });
      const token = await service.sign(CLAIMS);
      assert.equal(decodePart(token.split('.')[1]).iat, fixedMs / 1000);
    });

    it('rechaza un token con los claims manipulados', async () => {
      const service = createService(options);
      const [header, payload, signature] = (await service.sign(CLAIMS)).split('.');
      const tampered = base64url({ ...decodePart(payload), isAdmin: true });

      await assert.rejects(service.verify(`${header}.${tampered}.${signature}`), InvalidTokenError);
    });

    it('rechaza un token firmado con otra clave', async () => {
      const token = await createServiceWithOtherKey(options).sign(CLAIMS);
      await assert.rejects(createService(options).verify(token), InvalidTokenError);
    });

    it('rechaza un token caducado', async () => {
      const past = Date.now() - (TTL_SECONDS + 1) * 1000;
      const token = await createService({ ...options, now: () => past }).sign(CLAIMS);
      await assert.rejects(createService(options).verify(token), InvalidTokenError);
    });

    it('rechaza un token justo en el instante de caducidad', async () => {
      const start = Date.UTC(2026, 9, 13, 12, 0, 0);
      const token = await createService({ ...options, now: () => start }).sign(CLAIMS);
      const atExpiry = createService({ ...options, now: () => start + TTL_SECONDS * 1000 });
      await assert.rejects(atExpiry.verify(token), InvalidTokenError);
    });

    it('rechaza un token de otro emisor', async () => {
      const token = await createService({ ...options, issuer: 'otra-aplicacion' }).sign(CLAIMS);
      await assert.rejects(createService(options).verify(token), InvalidTokenError);
    });

    it('rechaza alg: none', async () => {
      const service = createService(options);
      const [, payload] = (await service.sign(CLAIMS)).split('.');
      const header = base64url({ alg: 'none', typ: 'JWT' });

      await assert.rejects(service.verify(`${header}.${payload}.`), InvalidTokenError);
    });

    it('rechaza un token cuya cabecera declara otro algoritmo', async () => {
      const service = createService(options);
      const [header, payload, signature] = (await service.sign(CLAIMS)).split('.');
      const otherAlg = decodePart(header).alg === 'HS512' ? 'HS256' : 'HS512';
      const forgedHeader = base64url({ ...decodePart(header), alg: otherAlg });

      await assert.rejects(service.verify(`${forgedHeader}.${payload}.${signature}`), InvalidTokenError);
    });

    it('rechaza cadenas que no son un JWT', async () => {
      const service = createService(options);
      for (const token of ['', 'abc', 'a.b', 'a.b.c', '!!!.###.$$$', null, undefined, 42]) {
        await assert.rejects(service.verify(token), InvalidTokenError, `token: ${String(token)}`);
      }
    });
  });
}
