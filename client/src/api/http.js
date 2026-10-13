import { clearToken, getToken } from './session.js';

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

// La sección privada ha rechazado el token (ausente, inválido o caducado).
export class SessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = 'SessionExpiredError';
  }
}

/**
 * fetch para la sección privada de la API: añade `Authorization: Bearer <token>`
 * y, ante un 401, descarta el token y lanza SessionExpiredError.
 */
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    throw new SessionExpiredError();
  }

  return response;
}
