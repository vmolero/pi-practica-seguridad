import {
  abrirClavePrivadaConKD,
  comprobarParDeClaves,
  derivarClaves,
  importarClavePublica,
  toBase64,
} from '../security/claves-usuario.js';
import { apiFetch } from './http.js';
import { clearSession, setToken, setUserKeys } from './session.js';

// Mensaje único para cualquier fallo de autenticación: no debe revelar si el
// email existe ni cuál de los dos campos es incorrecto.
export const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

// Mensaje para cualquier otro fallo: servidor caído, petición rechazada, etc.
export const CONNECTION_ERROR = 'No se ha podido iniciar sesión. Inténtalo de nuevo.';

// El servidor ha aceptado la clave de login, pero el navegador no ha podido
// abrir la clave privada del usuario con K_D (faltan las claves, c_kU no se
// descifra o la privada no corresponde a la pública).
export const PRIVATE_KEY_ERROR = 'No se ha podido abrir tu clave privada. Vuelve a intentarlo.';

/**
 * Abre el par de claves del usuario con K_D: k_U = D_K_D(c_kU), importa K_U
 * y comprueba que se corresponden. Devuelve { publicKey, privateKey } como
 * CryptoKey no exportables, o null si algo falla. No borra K_D.
 */
async function abrirClavesDeUsuario(K_D, keys) {
  if (!keys) return null;
  try {
    const privateKey = await abrirClavePrivadaConKD(K_D, keys);
    const publicKey = await importarClavePublica(keys.publicKey);
    if (!(await comprobarParDeClaves(publicKey, privateKey))) return null;
    return { publicKey, privateKey };
  } catch {
    return null;
  }
}

/**
 * Inicia sesión con email y contraseña. La contraseña no sale del navegador:
 * se deriva { K_L, K_D } (ver security/claves-usuario.js) y se envía solo
 * K_L como `loginKey` (base64). Si el servidor responde 200 con el token y
 * las claves del usuario { publicKey, privateKeyIv, encryptedPrivateKey },
 * se abre k_U con K_D, se comprueba que corresponde a K_U, y se guardan en
 * memoria el token y el par de claves; K_D se borra en todos los casos.
 * Devuelve { email, name, isAdmin } o lanza un Error con un mensaje apto para
 * mostrar al usuario. Si no se puede abrir la clave privada, el token
 * recibido se descarta sin usar.
 *
 * No usa apiFetch: aquí un 401 significa credenciales incorrectas, no sesión
 * caducada.
 */
export async function login({ email, password }) {
  const { K_L, K_D } = await derivarClaves(password);
  const loginKey = toBase64(K_L);
  K_L.fill(0);

  try {
    let response;
    try {
      response = await fetch('/api/public/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, loginKey }),
      });
    } catch {
      throw new Error(CONNECTION_ERROR);
    }

    if (!response.ok) {
      throw new Error(response.status === 401 ? GENERIC_LOGIN_ERROR : CONNECTION_ERROR);
    }

    const { token, user, keys } = await response.json();
    const userKeys = await abrirClavesDeUsuario(K_D, keys);
    if (!userKeys) throw new Error(PRIVATE_KEY_ERROR);

    setToken(token);
    setUserKeys(userKeys);
    return { email: user.email, name: user.name, isAdmin: user.isAdmin };
  } finally {
    K_D.fill(0);
  }
}

/**
 * Devuelve el usuario autenticado según el servidor (GET /api/private/me).
 * Lanza SessionExpiredError si el token ya no es válido.
 */
export async function getCurrentUser() {
  const response = await apiFetch('/api/private/me');
  if (!response.ok) throw new Error(CONNECTION_ERROR);
  return response.json();
}

export async function logout() {
  // Los tokens no se revocan en el servidor: cerrar sesión es descartar el
  // token y borrar K_D.
  clearSession();
}
