// PROVISIONAL: firma HMAC-SHA256 (HS256) con un secreto compartido, mediante
// la librería jose. Es capa de seguridad del equipo, que la sustituirá por una
// firma asimétrica con el par de claves del servidor manteniendo la misma
// interfaz (ver README.md de este directorio).
import { errors, jwtVerify, SignJWT } from 'jose';
import { InvalidTokenError } from '../../application/errors.js';

const ALGORITHM = 'HS256';

export function createTokenService({ secret, ttlSeconds, issuer, now = Date.now }) {
  const key = new TextEncoder().encode(secret);

  return {
    async sign(claims) {
      const issuedAt = Math.floor(now() / 1000);

      return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
        .setIssuer(issuer)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ttlSeconds)
        .sign(key);
    },

    async verify(token) {
      if (typeof token !== 'string') throw new InvalidTokenError();

      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer,
          clockTolerance: 0,
          currentDate: new Date(now()),
        });
        return payload;
      } catch (error) {
        if (error instanceof errors.JOSEError || error instanceof TypeError) {
          throw new InvalidTokenError();
        }
        throw error;
      }
    },
  };
}
