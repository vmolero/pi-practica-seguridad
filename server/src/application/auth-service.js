import { toSessionClaims } from '../domain/session.js';
import { toPublicUser } from '../domain/user.js';
import { InvalidCredentialsError } from './errors.js';

/**
 * Servicio de autenticación.
 * Recibe un repositorio con findByEmail(email) que devuelve el usuario o
 * undefined, y un servicio de tokens con sign(claims).
 */
export function createAuthService({ userRepository, tokenService }) {
  return {
    /**
     * Comprueba las credenciales y emite el token de sesión.
     * Devuelve { token, user } o lanza InvalidCredentialsError.
     */
    async login({ email, password }) {
      const user = await userRepository.findByEmail(email);

      // PROVISIONAL (paso 1): comparación en texto claro, sin hash ni sal.
      // La capa de seguridad sustituirá esta comprobación en un paso posterior.
      if (!user || user.password !== password) {
        throw new InvalidCredentialsError();
      }

      return {
        token: await tokenService.sign(toSessionClaims(user)),
        user: toPublicUser(user),
      };
    },
  };
}
