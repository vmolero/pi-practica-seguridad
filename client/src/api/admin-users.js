import { SessionExpiredError, apiFetch } from './http.js';

const USERS_PATH = '/api/private/admin/users';

export const FORBIDDEN_MESSAGE = 'No tienes permiso para gestionar usuarios.';
export const ADMIN_CONNECTION_ERROR = 'No se ha podido completar la operación. Inténtalo de nuevo.';

// El servidor ha respondido 403: el usuario ya no es administrador.
export class ForbiddenError extends Error {
  constructor() {
    super(FORBIDDEN_MESSAGE);
    this.name = 'ForbiddenError';
  }
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
    throw new Error(ADMIN_CONNECTION_ERROR);
  }

  if (response.status === 403) throw new ForbiddenError();
  if ([400, 404, 409].includes(response.status)) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || ADMIN_CONNECTION_ERROR);
  }
  if (!response.ok) throw new Error(ADMIN_CONNECTION_ERROR);
  return response;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Devuelve [{ id, name, email, isAdmin }]. */
export async function listUsers() {
  const response = await request(USERS_PATH);
  return (await response.json()).users;
}

/** Da de alta un usuario y devuelve { id, name, email, isAdmin }. */
export async function createUser({ name, email, password, isAdmin }) {
  const response = await request(USERS_PATH, jsonOptions('POST', { name, email, password, isAdmin }));
  return response.json();
}

/** Cambia el nombre y devuelve el usuario actualizado. */
export async function renameUser(id, name) {
  const response = await request(`${USERS_PATH}/${id}`, jsonOptions('PATCH', { name }));
  return response.json();
}

export async function deleteUser(id) {
  await request(`${USERS_PATH}/${id}`, { method: 'DELETE' });
}
