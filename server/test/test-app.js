import { createApp } from '../src/app.js';
import { createAuthService } from '../src/application/auth-service.js';
import { createCardService } from '../src/application/card-service.js';
import { createUserAdminService } from '../src/application/user-admin-service.js';
import { createCardRepository } from '../src/infrastructure/database/card-repository.js';
import { createUserRepository } from '../src/infrastructure/database/user-repository.js';
import { TOKEN_ISSUER } from '../src/infrastructure/security/issuer.js';
import { createLoginKeyService } from '../src/infrastructure/security/login-key-service.js';
import { createTokenService } from '../src/infrastructure/security/token-service.js';
import { DEVELOPMENT_LOGIN_PEPPER } from '../src/config.js';
import { createTestDatabase } from './helpers.js';

export const TEST_JWT_SECRET = 'secreto-de-pruebas-de-al-menos-32-caracteres';
// La semilla de la base de datos de pruebas usa la pimienta de desarrollo
// (LOGIN_PEPPER no está definida en los tests), así que el servidor también.
export const TEST_LOGIN_PEPPER = DEVELOPMENT_LOGIN_PEPPER;

export function createTestTokenService(options = {}) {
  return createTokenService({ secret: TEST_JWT_SECRET, ttlSeconds: 3600, issuer: TOKEN_ISSUER, ...options });
}

/**
 * Arranca la aplicación completa sobre una base de datos temporal sembrada,
 * en un puerto aleatorio. Devuelve { baseUrl, knex, close }; `knex` permite
 * comprobar o preparar datos directamente en la base de datos.
 */
export async function startTestServer() {
  const database = await createTestDatabase();
  const tokenService = createTestTokenService();
  const userRepository = createUserRepository(database.knex);
  const loginKeyService = createLoginKeyService({ pepper: TEST_LOGIN_PEPPER });
  const authService = createAuthService({ userRepository, loginKeyService, tokenService });
  const userAdminService = createUserAdminService({ userRepository, loginKeyService });
  const cardService = createCardService({ cardRepository: createCardRepository(database.knex) });

  const server = createApp({ authService, tokenService, userAdminService, userRepository, cardService }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    knex: database.knex,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await database.cleanup();
    },
  };
}
