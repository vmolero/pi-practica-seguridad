import { toSessionClaims } from '../domain/session.js';
import { toPublicUser } from '../domain/user.js';
import { InvalidCredentialsError } from './errors.js';

const LOGIN_KEY_LENGTH = 16;

/**
 * Servicio de autenticación.
 * Recibe un repositorio con findByEmail(email) que devuelve el usuario (con
 * loginKeySalt y loginKeyHash) o undefined, el servicio de clave de login
 * (verify, fakeSalt, hash) y un servicio de tokens con sign(claims).
 */
export function createAuthService({ userRepository, loginKeyService, tokenService }) {
  // Hash ficticio de la longitud correcta, calculado una sola vez: con un
  // email inexistente se recorre la misma ruta (KDF y comparación) que con
  // una clave incorrecta, para tardar un tiempo similar.
  let fakeHash;
  async function getFakeHash() {
    fakeHash ??= await loginKeyService.hash(new Uint8Array(LOGIN_KEY_LENGTH), loginKeyService.fakeSalt(''));
    return fakeHash;
  }

  return {
    /**
     * Comprueba la clave de login K_L (Uint8Array de 16 bytes) y emite el
     * token de sesión. Devuelve { token, user } o lanza
     * InvalidCredentialsError. K_L no se copia ni se registra.
     */
    async login({ email, loginKey }) {
      const user = await userRepository.findByEmail(email);

      if (!user || !user.loginKeySalt || !user.loginKeyHash) {
        await loginKeyService.verify(loginKey, loginKeyService.fakeSalt(email), await getFakeHash());
        throw new InvalidCredentialsError();
      }

      if (!(await loginKeyService.verify(loginKey, user.loginKeySalt, user.loginKeyHash))) {
        throw new InvalidCredentialsError();
      }

      return {
        token: await tokenService.sign(toSessionClaims(user)),
        user: toPublicUser(user),
      };
    },
  };
}
