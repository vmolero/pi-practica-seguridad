/**
 * Middleware que exige un administrador. Va siempre detrás del middleware de
 * autenticación, que deja el usuario del token en request.user.
 *
 * El token no se puede revocar, así que además del claim isAdmin comprueba en
 * la base de datos que el usuario sigue existiendo y sigue siendo
 * administrador. Ante cualquier fallo responde 403 sin indicar la causa.
 */
export function createRequireAdmin({ userRepository }) {
  return async function requireAdmin(request, response, next) {
    if (request.user?.isAdmin !== true) return rejectForbidden(response);

    let user;
    try {
      user = await userRepository.findById(request.user.id);
    } catch (error) {
      return next(error);
    }

    if (!user || !user.isAdmin) return rejectForbidden(response);
    return next();
  };
}

function rejectForbidden(response) {
  return response.status(403).json({ error: 'Acceso denegado' });
}
