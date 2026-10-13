// Usuario tal como lo guarda el repositorio:
// { id, name, email, password, isAdmin }

/**
 * Devuelve los datos del usuario que se pueden enviar al cliente.
 * Nunca incluye la contraseña.
 */
export function toPublicUser(user) {
  return {
    email: user.email,
    name: user.name,
    isAdmin: Boolean(user.isAdmin),
  };
}

/**
 * Datos de un usuario que ve el administrador en el panel de usuarios.
 * Nunca incluye la contraseña.
 */
export function toAdminUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: Boolean(user.isAdmin),
  };
}
