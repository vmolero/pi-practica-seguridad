const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Comprueba la forma del cuerpo de una petición de login.
 * Devuelve { email, password } con el email normalizado, o null si no es válida.
 * La contraseña se devuelve tal cual: distingue mayúsculas y espacios.
 */
export function parseLoginRequest(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const { email, password } = body;
  if (!isNonEmptyString(email, MAX_EMAIL_LENGTH) || !isNonEmptyString(password, MAX_PASSWORD_LENGTH)) {
    return null;
  }

  return { email: email.trim().toLowerCase(), password };
}
