// Validación estructural de las peticiones de tarjetas (paso 10). El servidor
// recibe los valores ya cifrados en el navegador, así que no puede comprobar
// el contenido (Luhn, caducidad, CVV): eso lo hace el cliente antes de cifrar
// (client/src/validation/card.js). Aquí solo se comprueba que lo que llega
// tiene exactamente la forma y los tamaños que produce el módulo
// client/src/security/tarjetas-cifradas.js.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
// Longitud en claro de cada valor (rellenado en el cliente) más la etiqueta.
export const CIPHERTEXT_LENGTHS = { number: 19 + TAG_LENGTH, expiry: 7 + TAG_LENGTH, cvv: 4 + TAG_LENGTH };
export const WRAPPED_KEY_LENGTH = 256;

const VALUE_FIELDS = new Set(Object.keys(CIPHERTEXT_LENGTHS));
const CREATE_FIELDS = new Set([...VALUE_FIELDS, 'id', 'wrappedKey']);
const VALUE_KEYS = new Set(['iv', 'ciphertext']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyFields(body, allowed) {
  return Object.keys(body).every((key) => allowed.has(key));
}

// Bytes que codifica un base64 válido, o -1 si no lo es.
function base64Length(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64.test(value)) return -1;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function isBase64Of(value, length) {
  return base64Length(value) === length;
}

// { iv, ciphertext } con los tamaños del campo, o null.
function parseValue(field, value) {
  if (!isPlainObject(value) || !hasOnlyFields(value, VALUE_KEYS) || Object.keys(value).length !== 2) return null;
  if (!isBase64Of(value.iv, IV_LENGTH) || !isBase64Of(value.ciphertext, CIPHERTEXT_LENGTHS[field])) return null;
  return { iv: value.iv, ciphertext: value.ciphertext };
}

/**
 * Comprueba el cuerpo de un alta de tarjeta. Devuelve
 * { id, number, expiry, cvv, wrappedKey } con el id en minúsculas, o null si
 * no es válido.
 */
export function parseCreateCardRequest(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, CREATE_FIELDS)) return null;
  if (typeof body.id !== 'string' || !UUID_V4.test(body.id)) return null;
  if (!isBase64Of(body.wrappedKey, WRAPPED_KEY_LENGTH)) return null;

  const data = { id: body.id.toLowerCase(), wrappedKey: body.wrappedKey };
  for (const field of VALUE_FIELDS) {
    data[field] = parseValue(field, body[field]);
    if (!data[field]) return null;
  }
  return data;
}

/**
 * Comprueba el cuerpo de una modificación: al menos uno de number, expiry y
 * cvv, cada uno { iv, ciphertext }, y nada más (ni id ni wrappedKey).
 * Devuelve solo los valores enviados, o null si no es válido.
 */
export function parseUpdateCardRequest(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, VALUE_FIELDS)) return null;
  if (Object.keys(body).length === 0) return null;

  const changes = {};
  for (const field of VALUE_FIELDS) {
    if (!(field in body)) continue;
    changes[field] = parseValue(field, body[field]);
    if (!changes[field]) return null;
  }
  return changes;
}

/**
 * Devuelve el parámetro :id si es un UUID, en minúsculas, o null si no lo es.
 */
export function parseCardId(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}
