const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const CREATE_FIELDS = new Set(['name', 'email', 'password', 'isAdmin']);
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

/**
 * Comprueba el cuerpo de un alta de usuario.
 * Devuelve { name, email, password, isAdmin } normalizado, o null si no es válido.
 * La contraseña se devuelve tal cual: distingue mayúsculas y espacios.
 */
export function parseCreateUserRequest(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, CREATE_FIELDS)) return null;

  const name = parseName(body.name);
  const email = parseEmail(body.email);
  if (!name || !email || !isValidPassword(body.password)) return null;

  const isAdmin = body.isAdmin ?? false;
  if (typeof isAdmin !== 'boolean') return null;

  return { name, email, password: body.password, isAdmin };
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
