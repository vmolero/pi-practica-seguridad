// Mensaje único para cualquier fallo de autenticación: no debe revelar si el
// email existe ni cuál de los dos campos es incorrecto.
export const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

// Credenciales de prueba mientras no exista el backend (solo para la simulación).
const DEMO_EMAIL = 'empleado@empresa.com';
const DEMO_PASSWORD = 'demo1234';

const SIMULATED_DELAY_MS = 800;

/**
 * Inicia sesión con email y contraseña.
 * Devuelve { email } si las credenciales son válidas y lanza un Error con un
 * mensaje genérico si no lo son.
 */
export async function login({ email, password }) {
  // TODO: sustituir la simulación por la llamada real cuando exista el backend:
  //
  //   const response = await fetch('/api/login', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     credentials: 'same-origin',
  //     body: JSON.stringify({ email, password }),
  //   });
  //   if (response.status === 401) throw new Error(GENERIC_LOGIN_ERROR);
  //   if (!response.ok) throw new Error('No se ha podido iniciar sesión. Inténtalo de nuevo.');
  //   return { email };
  //
  // El servidor responde 200 y establece la sesión, o 401
  // {"error":"Credenciales inválidas"}. La contraseña nunca se guarda en el
  // cliente ni se escribe en logs.
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));

  if (email.toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
    return { email };
  }
  throw new Error(GENERIC_LOGIN_ERROR);
}

export async function logout() {
  // TODO: llamar al endpoint de cierre de sesión cuando exista en el backend.
}
