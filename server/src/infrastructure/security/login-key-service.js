// Capa de seguridad: clave de login (ver README.md de este directorio).
//
//   h_L = KDF(K_L ‖ pimienta, sal)
//
// PROVISIONAL: implementación de Claude con scrypt de node:crypto hasta que
// el equipo decida la KDF definitiva (scrypt con parámetros medidos, Argon2id
// o bcrypt). La interfaz createLoginKeyService y la batería de contrato
// (test/login-key-service.contract.js) son las definitivas.

import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const LOGIN_KEY_LENGTH = 16;
export const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

// PROVISIONAL: parámetros de scrypt. N = 2^15 tarda unas decenas de
// milisegundos; el equipo los ajusta midiendo en Windows y Linux.
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function assertLoginKey(loginKey) {
  if (!(loginKey instanceof Uint8Array) || loginKey.length !== LOGIN_KEY_LENGTH) {
    throw new TypeError(`loginKey debe ser un Uint8Array de ${LOGIN_KEY_LENGTH} bytes`);
  }
}

/**
 * Servicio de clave de login. La pimienta es un secreto de configuración,
 * igual para todos los usuarios y ausente de la base de datos.
 */
export function createLoginKeyService({ pepper }) {
  if (typeof pepper !== 'string' || pepper.length === 0) {
    throw new TypeError('pepper debe ser una cadena no vacía');
  }
  const pepperBytes = Buffer.from(pepper, 'utf8');

  async function deriveHash(loginKey, salt) {
    assertLoginKey(loginKey);
    // Entrada: los 16 bytes de K_L seguidos de los bytes UTF-8 de la pimienta.
    const input = Buffer.concat([Buffer.from(loginKey), pepperBytes]);
    try {
      return await scryptAsync(input, Buffer.from(salt, 'base64'), HASH_LENGTH, SCRYPT_OPTIONS);
    } finally {
      input.fill(0);
    }
  }

  return {
    /** Sal aleatoria de 16 bytes, en base64. Una por usuario. */
    newSalt() {
      return randomBytes(SALT_LENGTH).toString('base64');
    },

    /** h_L = KDF(K_L ‖ pimienta, sal), en base64. */
    async hash(loginKey, salt) {
      return (await deriveHash(loginKey, salt)).toString('base64');
    },

    /**
     * Recalcula el hash y lo compara en tiempo constante con expectedHash.
     * Si expectedHash tiene otra longitud devuelve false, pero calcula el hash
     * igualmente para tardar lo mismo.
     */
    async verify(loginKey, salt, expectedHash) {
      const actual = await deriveHash(loginKey, salt);
      const expected = Buffer.from(String(expectedHash), 'base64');
      // Base64 bien formado (Buffer ignora relleno y caracteres sobrantes).
      const wellFormed = expected.toString('base64') === expectedHash;
      return wellFormed && expected.length === actual.length && timingSafeEqual(actual, expected);
    },

    /**
     * Sal ficticia para un email que no existe: HMAC-SHA-256(pimienta, email)
     * truncado a 16 bytes. Estable entre peticiones, para que un email
     * inexistente no se distinga de uno real ni por tiempo ni por repetición.
     */
    fakeSalt(email) {
      return createHmac('sha256', pepperBytes).update(String(email), 'utf8').digest()
        .subarray(0, SALT_LENGTH).toString('base64');
    },
  };
}
