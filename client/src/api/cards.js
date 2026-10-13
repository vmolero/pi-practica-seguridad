import { SessionExpiredError, apiFetch } from './http.js';

const CARDS_PATH = '/api/private/cards';

export const CARDS_CONNECTION_ERROR = 'No se ha podido completar la operación. Inténtalo de nuevo.';

// El servidor ha respondido 404: la tarjeta ya no existe (o no es del usuario).
export class CardNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CardNotFoundError';
  }
}

/**
 * Hace la petición y traduce los fallos a errores con un mensaje apto para
 * mostrar. Un 401 ya lo convierte apiFetch en SessionExpiredError.
 */
async function request(path, options = {}) {
  let response;
  try {
    response = await apiFetch(path, options);
  } catch (error) {
    if (error instanceof SessionExpiredError) throw error;
    throw new Error(CARDS_CONNECTION_ERROR);
  }

  if ([400, 403, 404].includes(response.status)) {
    const body = await response.json().catch(() => ({}));
    const message = body.error || CARDS_CONNECTION_ERROR;
    throw response.status === 404 ? new CardNotFoundError(message) : new Error(message);
  }
  if (!response.ok) throw new Error(CARDS_CONNECTION_ERROR);
  return response;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Devuelve [{ id, last4, expiryMonth, expiryYear, createdAt }]. */
export async function listCards() {
  const response = await request(CARDS_PATH);
  return (await response.json()).cards;
}

/** Da de alta una tarjeta y la devuelve enmascarada. */
export async function createCard({ number, expiryMonth, expiryYear, cvv }) {
  const response = await request(CARDS_PATH, jsonOptions('POST', { number, expiryMonth, expiryYear, cvv }));
  return response.json();
}

/** Modifica solo los campos de `changes` y devuelve la tarjeta enmascarada. */
export async function updateCard(id, changes) {
  const response = await request(`${CARDS_PATH}/${id}`, jsonOptions('PATCH', changes));
  return response.json();
}

export async function deleteCard(id) {
  await request(`${CARDS_PATH}/${id}`, { method: 'DELETE' });
}
