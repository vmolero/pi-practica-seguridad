// Capa de seguridad: claves del usuario (ver docs/diagrama-secuencia-alta-usuario.md).
//
//   h   = H(pw)            resumen de 256 bits de la contraseña
//   K_L = h[0..127]        clave de login (viaja al servidor; aún no se usa)
//   K_D = h[128..255]      clave de datos (nunca sale del navegador)
//   (K_U, k_U)             par RSA-OAEP de 2048 bits del usuario
//   c_kU = E_K_D(k_U)      clave privada cifrada con AES-128-CBC y un VI aleatorio
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
 * Inversa: k_U = D_K_D(c_kU). Devuelve la CryptoKey privada (RSA-OAEP, uso
 * 'decrypt'). Lanza ClavePrivadaError si pw no es la correcta: el relleno
 * PKCS#7 o la estructura PKCS#8 dejan de ser válidos.
 */
export async function abrirClavePrivada(pw, { encryptedPrivateKey, privateKeyIv }) {
  const { K_D } = await derivarClaves(pw);
  const aesKey = await importarClaveDeDatos(K_D, 'decrypt');
  K_D.fill(0);

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

/** Importa K_U (SPKI en base64) como CryptoKey pública para cifrar. */
export async function importarClavePublica(publicKey) {
  return subtle.importKey('spki', fromBase64(publicKey), RSA_IMPORT, false, ['encrypt']);
}
