import { createTokenService } from '../src/infrastructure/security/token-service.js';
import { runTokenServiceContractTests } from './token-service.contract.js';

const SECRET = 'secreto-de-pruebas-de-al-menos-32-caracteres';
const OTHER_SECRET = 'otro-secreto-de-pruebas-de-al-menos-32-caracteres';

runTokenServiceContractTests({
  createService: (options) => createTokenService({ ...options, secret: SECRET }),
  createServiceWithOtherKey: (options) => createTokenService({ ...options, secret: OTHER_SECRET }),
});
