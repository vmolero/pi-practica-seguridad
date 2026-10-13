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
