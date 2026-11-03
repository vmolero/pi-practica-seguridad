import { createPublicKey } from 'node:crypto';

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const MIN_RSA_MODULUS_BITS = 2048;
const IV_LENGTH = 16;
const AES_BLOCK = 16;
const MIN_ENCRYPTED_KEY_LENGTH = 16;
const MAX_ENCRYPTED_KEY_LENGTH = 4096;

const CREATE_FIELDS = new Set([
  'name', 'email', 'password', 'isAdmin', 'publicKey', 'encryptedPrivateKey', 'privateKeyIv',
]);
const RENAME_FIELDS = new Set(['name']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyFields(body, allowed) {
  return Object.keys(body).every((key) => allowed.has(key));
}

// Devuelve el nombre sin espacios en los extremos, o null si no es válido.
function parseName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

// Devuelve el email normalizado, o null si no es válido: exactamente una @
// con texto a ambos lados.
function parseEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH) return null;
  const parts = email.split('@');
  return parts.length === 2 && parts[0] && parts[1] ? email : null;
}

function isValidPassword(value) {
  return typeof value === 'string'
    && value.length >= MIN_PASSWORD_LENGTH
    && value.length <= MAX_PASSWORD_LENGTH;
}

// Devuelve los bytes de un texto en base64 estándar bien formado, o null.
function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  return Buffer.from(value, 'base64');
}

// K_U: clave pública SPKI (DER en base64) de tipo RSA con módulo de al menos
// 2048 bits. Devuelve el valor tal cual o null.
function parsePublicKey(value) {
  const der = decodeBase64(value);
  if (!der) return null;
  try {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'rsa') return null;
    if (key.asymmetricKeyDetails.modulusLength < MIN_RSA_MODULUS_BITS) return null;
    return value;
  } catch {
    return null;
  }
}

// VI: exactamente 16 bytes.
function parsePrivateKeyIv(value) {
  const bytes = decodeBase64(value);
  return bytes && bytes.length === IV_LENGTH ? value : null;
}

// c_kU: entre 16 y 4096 bytes, múltiplo del bloque de AES. El servidor no
// puede comprobar nada más: no tiene K_D.
function parseEncryptedPrivateKey(value) {
  const bytes = decodeBase64(value);
  if (!bytes) return null;
  const { length } = bytes;
  if (length < MIN_ENCRYPTED_KEY_LENGTH || length > MAX_ENCRYPTED_KEY_LENGTH || length % AES_BLOCK !== 0) return null;
  return value;
}

/**
 * Comprueba el cuerpo de un alta de usuario.
 * Devuelve { name, email, password, isAdmin, publicKey, encryptedPrivateKey,
 * privateKeyIv } normalizado, o null si no es válido.
 * La contraseña se devuelve tal cual: distingue mayúsculas y espacios. Los
 * campos de clave se devuelven tal cual llegan (base64).
 */
export function parseCreateUserRequest(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, CREATE_FIELDS)) return null;

  const name = parseName(body.name);
  const email = parseEmail(body.email);
  if (!name || !email || !isValidPassword(body.password)) return null;

  const isAdmin = body.isAdmin ?? false;
  if (typeof isAdmin !== 'boolean') return null;

  const publicKey = parsePublicKey(body.publicKey);
  const encryptedPrivateKey = parseEncryptedPrivateKey(body.encryptedPrivateKey);
  const privateKeyIv = parsePrivateKeyIv(body.privateKeyIv);
  if (!publicKey || !encryptedPrivateKey || !privateKeyIv) return null;

  return { name, email, password: body.password, isAdmin, publicKey, encryptedPrivateKey, privateKeyIv };
}

/**
 * Comprueba el cuerpo de un cambio de nombre: solo admite el campo `name`.
 * Devuelve { name } o null si no es válido.
 */
export function parseRenameUserRequest(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, RENAME_FIELDS)) return null;
  const name = parseName(body.name);
  return name ? { name } : null;
}

/**
 * Convierte el parámetro :id de la ruta en un entero positivo, o null si no
 * tiene ese formato.
 */
export function parseUserId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
