import { toPublicUser } from '../domain/user.js';
import { InvalidCredentialsError } from './errors.js';

/**
 * Servicio de autenticación.
 * Recibe un repositorio con findByEmail(email) que devuelve el usuario o undefined.
 */
export function createAuthService({ userRepository }) {
  return {
    /**
     * Comprueba las credenciales y devuelve el usuario público.
     * Lanza InvalidCredentialsError si no son válidas.
     */
    async login({ email, password }) {
      const user = await userRepository.findByEmail(email);

      // PROVISIONAL (paso 1): comparación en texto claro, sin hash ni sal.
      // La capa de seguridad sustituirá esta comprobación en el paso siguiente.
      if (!user || user.password !== password) {
        throw new InvalidCredentialsError();
      }

      return toPublicUser(user);
    },
  };
}
