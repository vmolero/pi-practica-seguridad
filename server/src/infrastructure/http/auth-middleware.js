import { InvalidTokenError } from '../../application/errors.js';
import { sessionUserFromClaims } from '../../domain/session.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Middleware de autenticación de la sección privada de la API.
 * Exige `Authorization: Bearer <token>`, verifica el token y deja el usuario en
 * request.user ({ id, email, name, isAdmin }). Ante cualquier fallo responde
 * 401 sin indicar la causa.
 */
export function createAuthMiddleware({ tokenService }) {
  return async function authenticate(request, response, next) {
    const match = BEARER_PATTERN.exec(request.headers.authorization ?? '');
    if (!match) return rejectUnauthenticated(response);

    let claims;
    try {
      claims = await tokenService.verify(match[1]);
    } catch (error) {
      if (error instanceof InvalidTokenError) return rejectUnauthenticated(response);
      return next(error);
    }

    const user = sessionUserFromClaims(claims);
    if (!user) return rejectUnauthenticated(response);

    request.user = user;
    return next();
  };
}

function rejectUnauthenticated(response) {
  return response.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'No autenticado' });
}
