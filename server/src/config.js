import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_JWT_TTL_SECONDS = 3600;

// Certificado y clave que genera `npm run cert`, en server/certs/.
const CERTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'certs');
export const DEFAULT_TLS_CERT_FILE = join(CERTS_DIR, 'cert.pem');
export const DEFAULT_TLS_KEY_FILE = join(CERTS_DIR, 'key.pem');

/**
 * Lee la configuración del servidor a partir de las variables de entorno.
 * Lanza un Error si algún valor definido no es válido.
 */
export function loadConfig(env = process.env, { warn = console.warn } = {}) {
  return {
    port: Number(env.PORT) || 3000,
    jwtSecret: loadJwtSecret(env.JWT_SECRET, warn),
    jwtTtlSeconds: loadJwtTtlSeconds(env.JWT_TTL_SECONDS),
    tlsCertFile: env.TLS_CERT_FILE ? resolve(env.TLS_CERT_FILE) : DEFAULT_TLS_CERT_FILE,
    tlsKeyFile: env.TLS_KEY_FILE ? resolve(env.TLS_KEY_FILE) : DEFAULT_TLS_KEY_FILE,
  };
}

// PROVISIONAL: secreto HMAC para la firma de tokens hasta que el equipo
// entregue la firma asimétrica con el par de claves del servidor.
function loadJwtSecret(value, warn) {
  if (value === undefined || value === '') {
    warn(
      'JWT_SECRET no está definido: se usa un secreto aleatorio. '
        + 'Los tokens dejarán de valer al reiniciar el servidor.',
    );
    return randomBytes(32).toString('base64url');
  }

  if (value.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres`);
  }

  return value;
}

function loadJwtTtlSeconds(value) {
  if (value === undefined || value === '') {
    return DEFAULT_JWT_TTL_SECONDS;
  }

  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 1) {
    throw new Error('JWT_TTL_SECONDS debe ser un número entero de segundos mayor que 0');
  }

  return ttl;
}
