import { apiFetch } from './http.js';
import { clearToken, setToken } from './session.js';

// Mensaje único para cualquier fallo de autenticación: no debe revelar si el
// email existe ni cuál de los dos campos es incorrecto.
export const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

// Mensaje para cualquier otro fallo: servidor caído, petición rechazada, etc.
export const CONNECTION_ERROR = 'No se ha podido iniciar sesión. Inténtalo de nuevo.';

/**
 * Inicia sesión con email y contraseña y guarda el token de sesión en memoria.
 * Devuelve { email, name, isAdmin } si las credenciales son válidas y lanza un
 * Error con un mensaje apto para mostrar al usuario si no lo son.
 *
 * No usa apiFetch: aquí un 401 significa credenciales incorrectas, no sesión
 * caducada.
 *
 * PROVISIONAL (paso 1): la contraseña viaja en texto claro.
 */
export async function login({ email, password }) {
  let response;
  try {
    response = await fetch('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error(CONNECTION_ERROR);
  }

  if (response.status === 401) throw new Error(GENERIC_LOGIN_ERROR);
  if (!response.ok) throw new Error(CONNECTION_ERROR);

  const { token, user } = await response.json();
  setToken(token);
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
  // Los tokens no se revocan en el servidor: cerrar sesión es descartarlo.
  clearToken();
}
