const MAX_EMAIL_LENGTH = 254;
const LOGIN_KEY_LENGTH = 16;
const LOGIN_KEY_BASE64_LENGTH = 24; // 16 bytes → 24 caracteres con '=='
const LOGIN_FIELDS = new Set(['email', 'loginKey']);

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Comprueba una clave de login K_L: base64 estándar que decodifica exactamente
 * 16 bytes y se recodifica igual (Buffer ignora relleno y caracteres
 * sobrantes, así que se compara la ida y vuelta). Devuelve un Uint8Array de
 * 16 bytes, o null.
 */
export function parseLoginKey(value) {
  if (typeof value !== 'string' || value.length !== LOGIN_KEY_BASE64_LENGTH) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== LOGIN_KEY_LENGTH || bytes.toString('base64') !== value) return null;
  return new Uint8Array(bytes);
}

/**
 * Comprueba la forma del cuerpo de una petición de login: solo `email` y
 * `loginKey` (la contraseña ya no viaja; si llega, la petición no es válida).
 * Devuelve { email, loginKey } con el email normalizado y la clave como
 * Uint8Array de 16 bytes, o null si no es válida.
 */
export function parseLoginRequest(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  if (!Object.keys(body).every((key) => LOGIN_FIELDS.has(key))) return null;

  const { email } = body;
  const loginKey = parseLoginKey(body.loginKey);
  if (!isNonEmptyString(email, MAX_EMAIL_LENGTH) || !loginKey) {
    return null;
  }

  return { email: email.trim().toLowerCase(), loginKey };
}
