// Usuario tal como lo guarda el repositorio:
// { id, name, email, isAdmin, loginKeySalt, loginKeyHash, publicKey,
//   encryptedPrivateKey, privateKeyIv }

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
 * Material de claves que se devuelve al propio usuario en el login: su clave
 * pública K_U, el VI y la clave privada cifrada c_kU, tal como están
 * guardados (base64). null si falta alguno (usuario creado sin claves).
 * Nunca incluye la sal ni el hash de la clave de login.
 */
export function toUserKeys(user) {
  const { publicKey, privateKeyIv, encryptedPrivateKey } = user;
  if (!publicKey || !privateKeyIv || !encryptedPrivateKey) return null;
  return { publicKey, privateKeyIv, encryptedPrivateKey };
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
