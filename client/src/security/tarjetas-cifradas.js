// Capa de seguridad: cifrado de tarjetas (ver docs/diagrama-secuencia-crear-tarjeta.md).
//
//   K_t                      clave AES-256 aleatoria, una por tarjeta
//   w_U   = E_K_U(K_t)       K_t envuelta con la clave pública del usuario (RSA-OAEP)
//   VI_x                     vector de 12 bytes aleatorio, uno por valor y por cifrado
//   AAD_x = "<id>:<campo>"   datos asociados: ligan el valor a su tarjeta y a su campo
//   c_x   = E_K_t(m_x)       AES-256-GCM con VI_x y AAD_x; etiqueta de 128 bits
//
// Valores: number (19 caracteres, rellenado con espacios por la izquierda),
// expiry ("MM/AAAA", 7) y cvv (4, rellenado). Con el relleno todos los
// cifrados miden lo mismo (35, 23 y 20 bytes) y el servidor no aprende cuántos
// dígitos tiene la tarjeta.
//
// El servidor guarda VI_x, c_x y w_U y no puede abrir nada: K_t solo existe en
// claro en la memoria del navegador, como CryptoKey no exportable, y w_U solo
// se abre con k_U. Cualquier cambio en c_x o VI_x, o su traslado a otra
// tarjeta u otro campo, hace fallar la etiqueta de GCM: TarjetaCifradaError.
//
// Solo usa globalThis.crypto (Web Crypto), disponible en el navegador y en
// Node 20+, de modo que la semilla, los scripts y los tests pueden importarlo.

import { fromBase64, toBase64 } from './claves-usuario.js';

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

/** Longitud en claro de cada valor; el cifrado mide 16 bytes más. */
export const FIELD_LENGTHS = { number: 19, expiry: 7, cvv: 4 };
export const FIELDS = Object.keys(FIELD_LENGTHS);
export const WRAPPED_KEY_LENGTH = 256; // RSA de 2048 bits

export const TARJETA_CIFRADA_ERROR = 'No se ha podido descifrar la tarjeta.';

/** w_U no se abre con k_U, o algún valor está dañado o no es de esta tarjeta. */
export class TarjetaCifradaError extends Error {
  constructor() {
    super(TARJETA_CIFRADA_ERROR);
    this.name = 'TarjetaCifradaError';
  }
}

function aad(id, field) {
  return encoder.encode(`${id}:${field}`);
}

function importarClaveTarjeta(raw) {
  return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function cifrarValor(K_t, id, field, value) {
  const length = FIELD_LENGTHS[field];
  if (typeof value !== 'string' || value.length > length) throw new TypeError(`Valor de ${field} no válido`);
  const plaintext = encoder.encode(value.padStart(length, ' '));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(id, field), tagLength: TAG_LENGTH },
    K_t,
    plaintext,
  );
  plaintext.fill(0);
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

async function descifrarValor(K_t, id, field, { iv, ciphertext }) {
  const plaintext = new Uint8Array(await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv), additionalData: aad(id, field), tagLength: TAG_LENGTH },
    K_t,
    fromBase64(ciphertext),
  ));
  if (plaintext.length !== FIELD_LENGTHS[field]) throw new TarjetaCifradaError();
  const value = decoder.decode(plaintext).trimStart();
  plaintext.fill(0);
  return value;
}

/**
 * Cifra los valores indicados de la tarjeta `id` con una K_t ya abierta, con
 * un VI nuevo para cada uno. Devuelve { campo: { iv, ciphertext } } solo con
 * los campos presentes en `valores`. Es lo que usa la edición.
 */
export async function cifrarValores(K_t, id, valores) {
  const result = {};
  for (const field of FIELDS) {
    if (valores[field] !== undefined) result[field] = await cifrarValor(K_t, id, field, valores[field]);
  }
  return result;
}

/**
 * Cifra una tarjeta nueva: genera K_t, cifra number, expiry y cvv y envuelve
 * K_t con K_U. Devuelve, en base64,
 * { id, number: { iv, ciphertext }, expiry: {…}, cvv: {…}, wrappedKey }.
 */
export async function cifrarTarjeta(K_U, { id, number, expiry, cvv }) {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  try {
    const K_t = await importarClaveTarjeta(raw);
    const wrappedKey = toBase64(await subtle.encrypt({ name: 'RSA-OAEP' }, K_U, raw));
    const values = await cifrarValores(K_t, id, { number, expiry, cvv });
    return { id, ...values, wrappedKey };
  } finally {
    raw.fill(0);
  }
}

/**
 * K_t = D_k_U(w_U). Devuelve la CryptoKey AES-GCM no exportable, con usos
 * encrypt y decrypt. Lanza TarjetaCifradaError si no se abre.
 */
export async function abrirClaveTarjeta(k_U, wrappedKey) {
  let raw;
  try {
    raw = new Uint8Array(await subtle.decrypt({ name: 'RSA-OAEP' }, k_U, fromBase64(wrappedKey)));
    if (raw.length !== KEY_LENGTH) throw new TarjetaCifradaError();
    return await importarClaveTarjeta(raw);
  } catch {
    throw new TarjetaCifradaError();
  } finally {
    if (raw) raw.fill(0);
  }
}

/**
 * Abre K_t con k_U y descifra los tres valores. Devuelve
 * { id, number, expiry, cvv } en claro. Lanza TarjetaCifradaError ante
 * cualquier fallo, sin distinguir la causa ni devolver datos parciales.
 */
export async function descifrarTarjeta(k_U, { id, wrappedKey, ...values }) {
  const K_t = await abrirClaveTarjeta(k_U, wrappedKey);
  const card = { id };
  try {
    for (const field of FIELDS) card[field] = await descifrarValor(K_t, id, field, values[field]);
  } catch {
    throw new TarjetaCifradaError();
  }
  return card;
}
