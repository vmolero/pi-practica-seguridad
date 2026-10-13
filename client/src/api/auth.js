// Mensaje único para cualquier fallo de autenticación: no debe revelar si el
// email existe ni cuál de los dos campos es incorrecto.
export const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

// Mensaje para cualquier otro fallo: servidor caído, petición rechazada, etc.
export const CONNECTION_ERROR = 'No se ha podido iniciar sesión. Inténtalo de nuevo.';

/**
 * Inicia sesión con email y contraseña.
 * Devuelve { email, name, isAdmin } si las credenciales son válidas y lanza un
 * Error con un mensaje apto para mostrar al usuario si no lo son.
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

  const { email: userEmail, name, isAdmin } = await response.json();
  return { email: userEmail, name, isAdmin };
}

export async function logout() {
  // Todavía no hay sesión en el servidor: cerrar sesión solo borra el estado
  // del cliente.
}
