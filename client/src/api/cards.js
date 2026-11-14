import {
  TarjetaCifradaError,
  abrirClaveTarjeta,
  cifrarTarjeta,
  cifrarValores,
  descifrarTarjeta,
} from '../security/tarjetas-cifradas.js';
import { SessionExpiredError, apiFetch } from './http.js';
import { clearSession, getUserKeys } from './session.js';

const CARDS_PATH = '/api/private/cards';

export const CARDS_CONNECTION_ERROR = 'No se ha podido completar la operación. Inténtalo de nuevo.';
export const CARD_DAMAGED_MESSAGE = 'Tarjeta dañada: no se ha podido descifrar.';

// El servidor ha respondido 404: la tarjeta ya no existe (o no es del usuario).
export class CardNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CardNotFoundError';
  }
}

// Todo lo que sale hacia el servidor va cifrado con la clave de la tarjeta
// (paso 10, client/src/security/tarjetas-cifradas.js), y todo lo que llega se
// descifra aquí con la clave privada abierta en el login. El panel solo ve
// resúmenes: { id, last4, expiryMonth, expiryYear, createdAt, wrappedKey,
// encrypted } o, si la tarjeta no se puede abrir, { id, createdAt, damaged }.
// El número completo y el CVV descifrados se descartan en cuanto se calcula
// el resumen; nada se escribe en la consola ni en el almacenamiento.

// Claves del usuario; sin ellas no hay sesión que valga.
function userKeys() {
  const keys = getUserKeys();
  if (!keys) {
    clearSession();
    throw new SessionExpiredError();
  }
  return keys;
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

  if ([400, 403, 404, 409].includes(response.status)) {
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

// La caducidad se cifra como "MM/AAAA"; el formulario y el panel usan mes y año.
function toExpiryText(expiryMonth, expiryYear) {
  return `${String(expiryMonth).padStart(2, '0')}/${expiryYear}`;
}

function fromExpiryText(expiry) {
  const [month, year] = expiry.split('/');
  return { expiryMonth: Number(month), expiryYear: Number(year) };
}

// Valores del formulario → valores del módulo de cifrado (solo los presentes).
function toValues({ number, expiryMonth, expiryYear, cvv }) {
  const values = {};
  if (number !== undefined) values.number = number;
  if (expiryMonth !== undefined && expiryYear !== undefined) values.expiry = toExpiryText(expiryMonth, expiryYear);
  if (cvv !== undefined) values.cvv = cvv;
  return values;
}

/**
 * Descifra una tarjeta de la API y devuelve su resumen. Si no se abre o no
 * supera la comprobación de integridad, devuelve { id, createdAt, damaged }.
 */
async function toSummary(privateKey, card) {
  const { id, createdAt, wrappedKey, number, expiry, cvv } = card;
  try {
    const plain = await descifrarTarjeta(privateKey, { id, wrappedKey, number, expiry, cvv });
    return {
      id,
      last4: plain.number.slice(-4),
      ...fromExpiryText(plain.expiry),
      createdAt,
      wrappedKey,
      encrypted: { number, expiry, cvv },
    };
  } catch (error) {
    if (error instanceof TarjetaCifradaError) return { id, createdAt, damaged: true };
    throw error;
  }
}

/** Devuelve los resúmenes de las tarjetas del usuario, descifradas aquí. */
export async function listCards() {
  const { privateKey } = userKeys();
  const response = await request(CARDS_PATH);
  const { cards } = await response.json();
  return Promise.all(cards.map((card) => toSummary(privateKey, card)));
}

/**
 * Cifra la tarjeta con una clave nueva envuelta con la clave pública del
 * usuario, la da de alta y devuelve su resumen.
 */
export async function createCard({ number, expiryMonth, expiryYear, cvv }) {
  const { publicKey, privateKey } = userKeys();
  const id = globalThis.crypto.randomUUID();
  const body = await cifrarTarjeta(publicKey, { id, number, expiry: toExpiryText(expiryMonth, expiryYear), cvv });
  const response = await request(CARDS_PATH, jsonOptions('POST', body));
  return toSummary(privateKey, await response.json());
}

/**
 * Abre la clave de la tarjeta, cifra solo los campos de `changes` con
 * vectores nuevos, los envía y devuelve el resumen actualizado.
 */
export async function updateCard(card, changes) {
  const { privateKey } = userKeys();
  const K_t = await abrirClaveTarjeta(privateKey, card.wrappedKey);
  const body = await cifrarValores(K_t, card.id, toValues(changes));
  const response = await request(`${CARDS_PATH}/${card.id}`, jsonOptions('PATCH', body));
  return toSummary(privateKey, await response.json());
}

export async function deleteCard(id) {
  await request(`${CARDS_PATH}/${id}`, { method: 'DELETE' });
}
