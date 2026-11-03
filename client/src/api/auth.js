import { derivarClaves, toBase64 } from '../security/claves-usuario.js';
import { apiFetch } from './http.js';
import { clearSession, setDataKey, setToken } from './session.js';

// Mensaje único para cualquier fallo de autenticación: no debe revelar si el
// email existe ni cuál de los dos campos es incorrecto.
export const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

// Mensaje para cualquier otro fallo: servidor caído, petición rechazada, etc.
export const CONNECTION_ERROR = 'No se ha podido iniciar sesión. Inténtalo de nuevo.';

/**
 * Inicia sesión con email y contraseña. La contraseña no sale del navegador:
 * se deriva { K_L, K_D } (ver security/claves-usuario.js), se envía solo
 * K_L como `loginKey` (base64) y, si el servidor responde 200, se guardan en
 * memoria el token de sesión y K_D. Devuelve { email, name, isAdmin } si las
 * credenciales son válidas y lanza un Error con un mensaje apto para mostrar
 * al usuario si no lo son; en ese caso K_D se descarta.
 *
 * No usa apiFetch: aquí un 401 significa credenciales incorrectas, no sesión
 * caducada.
 */
export async function login({ email, password }) {
  const { K_L, K_D } = await derivarClaves(password);
  const loginKey = toBase64(K_L);
  K_L.fill(0);

  let response;
  try {
    response = await fetch('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, loginKey }),
    });
  } catch {
    K_D.fill(0);
    throw new Error(CONNECTION_ERROR);
  }

  if (!response.ok) {
    K_D.fill(0);
    throw new Error(response.status === 401 ? GENERIC_LOGIN_ERROR : CONNECTION_ERROR);
  }

  const { token, user } = await response.json();
  setToken(token);
  setDataKey(K_D);
  return { email: user.email, name: user.name, isAdmin: user.isAdmin };
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
