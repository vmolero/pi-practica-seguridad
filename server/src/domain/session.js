// Claims propios del token de sesión. El servicio de tokens añade iss, iat y exp.

/**
 * Claims que identifican al usuario en su token de sesión.
 */
export function toSessionClaims(user) {
  return {
    sub: String(user.id),
    email: user.email,
    name: user.name,
    isAdmin: Boolean(user.isAdmin),
  };
}

/**
 * Usuario de la sesión a partir de los claims de un token ya verificado.
 * Devuelve { id, email, name, isAdmin }, o null si los claims no tienen la
 * forma esperada.
 */
export function sessionUserFromClaims(claims) {
  if (typeof claims !== 'object' || claims === null) return null;

  const { sub, email, name, isAdmin } = claims;
  if (typeof sub !== 'string' || !/^[1-9]\d*$/.test(sub)) return null;
  if (typeof email !== 'string' || typeof name !== 'string') return null;
  if (typeof isAdmin !== 'boolean') return null;

  const id = Number(sub);
  if (!Number.isSafeInteger(id)) return null;

  return { id, email, name, isAdmin };
}
