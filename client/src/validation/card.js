// Validación de tarjetas en el cliente. Aplica las mismas reglas que el
// servidor (server/src/infrastructure/http/card-request.js) para mostrar el
// error junto a cada campo sin enviar la petición; el servidor vuelve a
// comprobarlo todo.

const MAX_YEARS_AHEAD = 20;

export const CARD_MESSAGES = {
  number: 'El número de tarjeta no es válido.',
  expiry: 'La fecha de caducidad no es válida.',
  expiryIncomplete: 'Indica el mes y el año de caducidad.',
  expired: 'La tarjeta está caducada.',
  cvv: 'El CVV debe tener 3 o 4 dígitos.',
  noChanges: 'No has cambiado ningún dato.',
};

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

// Devuelve el entero de un campo de texto con solo dígitos, o null.
function toInteger(text) {
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * Valida los campos del formulario, que llegan como texto:
 * { number, expiryMonth, expiryYear, cvv }.
 * Devuelve { errors, data }: `errors` tiene un mensaje por campo con error
 * (`number`, `expiry`, `cvv` o `form`) y `data`, los campos listos para la API.
 * Con `partial` (edición), los campos vacíos se ignoran y no se envían, pero
 * hace falta al menos uno, y el mes y el año van juntos.
 */
export function validateCardForm(values, now = new Date(), { partial = false } = {}) {
  const errors = {};
  const data = {};
  const number = (values.number ?? '').replace(/[\s-]/g, '');
  const month = (values.expiryMonth ?? '').trim();
  const year = (values.expiryYear ?? '').trim();
  const cvv = (values.cvv ?? '').trim();

  if (!partial || number) {
    if (/^\d{13,19}$/.test(number) && passesLuhn(number)) data.number = number;
    else errors.number = CARD_MESSAGES.number;
  }

  if (!partial || month || year) {
    const expiryMonth = toInteger(month);
    const expiryYear = /^\d{4}$/.test(year) ? Number(year) : null;
    const currentYear = now.getFullYear();
    if (partial && (!month || !year)) {
      errors.expiry = CARD_MESSAGES.expiryIncomplete;
    } else if (
      expiryMonth === null || expiryMonth < 1 || expiryMonth > 12
      || expiryYear === null || expiryYear > currentYear + MAX_YEARS_AHEAD
    ) {
      errors.expiry = CARD_MESSAGES.expiry;
    } else if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < now.getMonth() + 1)) {
      errors.expiry = CARD_MESSAGES.expired;
    } else {
      data.expiryMonth = expiryMonth;
      data.expiryYear = expiryYear;
    }
  }

  if (!partial || cvv) {
    if (/^\d{3,4}$/.test(cvv)) data.cvv = cvv;
    else errors.cvv = CARD_MESSAGES.cvv;
  }

  if (partial && !number && !month && !year && !cvv) errors.form = CARD_MESSAGES.noChanges;

  return { errors, data };
}

/**
 * Caducidad en la forma MM/AA.
 */
export function formatExpiry(month, year) {
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
}
