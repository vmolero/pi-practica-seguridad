import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generarClavesUsuario } from '../../client/src/security/claves-usuario.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';

let testUserKeys;

/**
 * Material de claves válido para las altas de prueba, generado una sola vez
 * por proceso con el mismo módulo que usa el navegador (RSA 2048 tarda).
 * Devuelve { publicKey, encryptedPrivateKey, privateKeyIv } en base64.
 */
export function getTestUserKeys(password = 'inicial123') {
  testUserKeys ??= generarClavesUsuario(password);
  return testUserKeys;
}

/** Clave pública RSA de 1024 bits (SPKI en base64): demasiado corta. */
export function weakPublicKey() {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

/**
 * Crea una base de datos SQLite temporal con las migraciones y el seed aplicados.
 * Devuelve { knex, cleanup }.
 */
export async function createTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'tarjetas-test-'));
  const knex = createDatabase({ filename: join(directory, 'test.sqlite') });
  await knex.migrate.latest();
  await knex.seed.run();

  return {
    knex,
    async cleanup() {
      await knex.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
