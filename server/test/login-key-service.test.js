import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLoginKeyService } from '../src/infrastructure/security/login-key-service.js';
import { runLoginKeyServiceContractTests } from './login-key-service.contract.js';

// Implementación provisional (scrypt de node:crypto).
runLoginKeyServiceContractTests(createLoginKeyService);

describe('createLoginKeyService (provisional)', () => {
  it('exige una pimienta no vacía', () => {
    assert.throws(() => createLoginKeyService({ pepper: '' }), TypeError);
    assert.throws(() => createLoginKeyService({}), TypeError);
  });

  it('produce hashes de 32 bytes', async () => {
    const service = createLoginKeyService({ pepper: 'pimienta-de-pruebas-16-chars' });
    const digest = await service.hash(new Uint8Array(16), service.newSalt());
    assert.equal(Buffer.from(digest, 'base64').length, 32);
  });
});
