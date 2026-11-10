// Capa de seguridad: claves del usuario (ver docs/diagrama-secuencia-alta-usuario.md).
//
//   h   = H(pw)            resumen de 256 bits de la contraseña
//   K_L = h[0..127]        clave de login (viaja al servidor)
//   K_D = h[128..255]      clave de datos (nunca sale del navegador)
//   (K_U, k_U)             par RSA-OAEP de 2048 bits del usuario
//   c_kU = E_K_D(k_U)      clave privada cifrada con AES-128-CBC y un VI aleatorio
//
// En el login el navegador recibe K_U, VI y c_kU, abre k_U = D_K_D(c_kU) y
// comprueba que k_U corresponde a K_U (D_k_U(E_K_U(r)) = r con r aleatorio).
//
// PROVISIONAL: H es SHA-256 de Web Crypto en lugar de SHA3-256, hasta que el
// equipo decida la implementación de SHA3 (ver design.md D2). La interfaz y
// el resto del esquema son los definitivos.
//
// Solo usa globalThis.crypto (Web Crypto), disponible en el navegador y en
// Node 20+, de modo que la semilla del servidor puede importar este módulo.

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

const RSA_GENERATION = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), // 65537
  hash: 'SHA-256',
};
const RSA_IMPORT = { name: 'RSA-OAEP', hash: 'SHA-256' };
const IV_LENGTH = 16;
const KEY_PAIR_CHECK_LENGTH = 32;

export const CLAVE_PRIVADA_ERROR = 'No se ha podido abrir la clave privada: la contraseña no es correcta.';

/** La contraseña no abre la clave privada cifrada (o c_kU está dañada). */
export class ClavePrivadaError extends Error {
  constructor() {
    super(CLAVE_PRIVADA_ERROR);
    this.name = 'ClavePrivadaError';
  }
}

export function toBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// PROVISIONAL: SHA-256 en lugar de SHA3-256.
async function resumirContrasena(pw) {
  return new Uint8Array(await subtle.digest('SHA-256', encoder.encode(pw)));
}

/**
 * h = H(pw); devuelve { K_L, K_D }, cada una un Uint8Array de 16 bytes.
 */
export async function derivarClaves(pw) {
  const h = await resumirContrasena(pw);
  const claves = { K_L: h.slice(0, 16), K_D: h.slice(16, 32) };
  h.fill(0);
  return claves;
}

async function importarClaveDeDatos(K_D, usage) {
  return subtle.importKey('raw', K_D, 'AES-CBC', false, [usage]);
}

/**
 * Genera (K_U, k_U), cifra k_U con K_D y devuelve, en base64,
 * { publicKey, encryptedPrivateKey, privateKeyIv }.
 */
export async function generarClavesUsuario(pw) {
  const { K_D } = await derivarClaves(pw);
  const par = await subtle.generateKey(RSA_GENERATION, true, ['encrypt', 'decrypt']);
  const publicKey = await subtle.exportKey('spki', par.publicKey);
  const privateKey = new Uint8Array(await subtle.exportKey('pkcs8', par.privateKey));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const aesKey = await importarClaveDeDatos(K_D, 'encrypt');
  const encryptedPrivateKey = await subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, privateKey);

  // Lo que no debe quedar en memoria más de lo necesario.
  privateKey.fill(0);
  K_D.fill(0);

  return {
    publicKey: toBase64(publicKey),
    encryptedPrivateKey: toBase64(encryptedPrivateKey),
    privateKeyIv: toBase64(iv),
  };
}

/**
 * Inversa con la clave de datos ya derivada: k_U = D_K_D(c_kU). Devuelve la
 * CryptoKey privada (RSA-OAEP, uso 'decrypt', no exportable). Lanza
 * ClavePrivadaError si K_D no es la correcta: el relleno PKCS#7 o la
 * estructura PKCS#8 dejan de ser válidos. No borra K_D: es del llamador.
 */
export async function abrirClavePrivadaConKD(K_D, { encryptedPrivateKey, privateKeyIv }) {
  const aesKey = await importarClaveDeDatos(K_D, 'decrypt');

  let pkcs8;
  try {
    pkcs8 = await subtle.decrypt(
      { name: 'AES-CBC', iv: fromBase64(privateKeyIv) },
      aesKey,
      fromBase64(encryptedPrivateKey),
    );
    return await subtle.importKey('pkcs8', pkcs8, RSA_IMPORT, false, ['decrypt']);
  } catch {
    throw new ClavePrivadaError();
  } finally {
    if (pkcs8) new Uint8Array(pkcs8).fill(0);
  }
}

/**
 * Inversa a partir de la contraseña: deriva K_D, abre k_U y borra K_D.
 */
export async function abrirClavePrivada(pw, claves) {
  const { K_D } = await derivarClaves(pw);
  try {
    return await abrirClavePrivadaConKD(K_D, claves);
  } finally {
    K_D.fill(0);
  }
}

/**
 * Comprueba que la clave privada corresponde a la pública: cifra r aleatorio
 * (32 bytes) con K_U y lo descifra con k_U. Devuelve true solo si el
 * resultado es r; false ante cualquier fallo, sin lanzar excepciones.
 */
export async function comprobarParDeClaves(publicKey, privateKey) {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(KEY_PAIR_CHECK_LENGTH));
  try {
    const ciphertext = await subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, r);
    const plaintext = new Uint8Array(await subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ciphertext));
    if (plaintext.length !== r.length) return false;
    let diff = 0;
    for (let i = 0; i < r.length; i += 1) diff |= plaintext[i] ^ r[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** Importa K_U (SPKI en base64) como CryptoKey pública para cifrar. */
export async function importarClavePublica(publicKey) {
  return subtle.importKey('spki', fromBase64(publicKey), RSA_IMPORT, false, ['encrypt']);
}
