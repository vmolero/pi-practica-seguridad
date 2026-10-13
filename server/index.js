import { createApp } from './src/app.js';
import { createAuthService } from './src/application/auth-service.js';
import { createUserAdminService } from './src/application/user-admin-service.js';
import { loadConfig } from './src/config.js';
import { createDatabase } from './src/infrastructure/database/knex.js';
import { createUserRepository } from './src/infrastructure/database/user-repository.js';
import { TOKEN_ISSUER } from './src/infrastructure/security/issuer.js';
import { createTokenService } from './src/infrastructure/security/token-service.js';

const config = loadConfig(process.env);

const knex = createDatabase();
const userRepository = createUserRepository(knex);
const tokenService = createTokenService({
  secret: config.jwtSecret,
  ttlSeconds: config.jwtTtlSeconds,
  issuer: TOKEN_ISSUER,
});
const authService = createAuthService({ userRepository, tokenService });
const userAdminService = createUserAdminService({ userRepository });

const app = createApp({ authService, tokenService, userAdminService, userRepository });

app.listen(config.port, () => {
  console.log(`API server listening at http://localhost:${config.port}`);
});
