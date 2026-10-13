const MAX_NUMBER_LENGTH = 32;
const MAX_YEARS_AHEAD = 20;

const CARD_FIELDS = new Set(['number', 'expiryMonth', 'expiryYear', 'cvv']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyFields(body, allowed) {
  return Object.keys(body).every((key) => allowed.has(key));
}

/**
 * Comprobación de Luhn sobre una cadena de dígitos.
 */
export function passesLuhn(digits) {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// Devuelve el número sin espacios ni guiones, o null si no es válido.
function parseNumber(value) {
  if (typeof value !== 'string' || value.length > MAX_NUMBER_LENGTH) return null;
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{13,19}$/.test(digits) && passesLuhn(digits) ? digits : null;
}

// Una tarjeta vale hasta el último día de su mes: es válida si (año, mes) no
// es anterior al mes actual, y el año no supera en más de 20 al actual.
function isValidExpiry(month, year, now) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const currentYear = now.getFullYear();
  if (!Number.isInteger(year) || year > currentYear + MAX_YEARS_AHEAD) return false;
  return year > currentYear || (year === currentYear && month >= now.getMonth() + 1);
}

function isValidCvv(value) {
  return typeof value === 'string' && /^\d{3,4}$/.test(value);
}

/**
 * Comprueba el cuerpo de un alta de tarjeta.
 * Devuelve { number, expiryMonth, expiryYear, cvv } normalizado, o null si no
 * es válido. `now` permite fijar la fecha actual en las pruebas.
 */
export function parseCreateCardRequest(body, { now = new Date() } = {}) {
  if (!isPlainObject(body) || !hasOnlyFields(body, CARD_FIELDS)) return null;

  const number = parseNumber(body.number);
  const { expiryMonth, expiryYear, cvv } = body;
  if (!number || !isValidExpiry(expiryMonth, expiryYear, now) || !isValidCvv(cvv)) return null;

  return { number, expiryMonth, expiryYear, cvv };
}

/**
 * Comprueba el cuerpo de una modificación de tarjeta: al menos un campo, los
 * mismos que el alta, y el mes y el año de caducidad siempre juntos.
 * Devuelve solo los campos enviados, normalizados, o null si no es válido.
 */
export function parseUpdateCardRequest(body, { now = new Date() } = {}) {
  if (!isPlainObject(body) || !hasOnlyFields(body, CARD_FIELDS)) return null;
  if (Object.keys(body).length === 0) return null;

  const changes = {};

  if ('number' in body) {
    changes.number = parseNumber(body.number);
    if (!changes.number) return null;
  }

  if ('expiryMonth' in body || 'expiryYear' in body) {
    if (!isValidExpiry(body.expiryMonth, body.expiryYear, now)) return null;
    changes.expiryMonth = body.expiryMonth;
    changes.expiryYear = body.expiryYear;
  }

  if ('cvv' in body) {
    if (!isValidCvv(body.cvv)) return null;
    changes.cvv = body.cvv;
  }

  return changes;
}

/**
 * Devuelve el parámetro :id si es un UUID, en minúsculas, o null si no lo es.
 */
export function parseCardId(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}
