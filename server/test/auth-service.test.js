import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createAuthService } from '../src/application/auth-service.js';
import { InvalidCredentialsError } from '../src/application/errors.js';

const EMPLOYEE_KEY = Uint8Array.from({ length: 16 }, (_, i) => i);
const ADMIN_KEY = Uint8Array.from({ length: 16 }, (_, i) => 100 + i);
const WRONG_KEY = new Uint8Array(16).fill(255);

const EMPLOYEE_KEYS = { publicKey: 'K_U-empleado', privateKeyIv: 'VI-empleado', encryptedPrivateKey: 'c_kU-empleado' };

const users = [
  {
    id: 1, name: 'Empleado', email: 'empleado@empresa.com', isAdmin: 0,
    loginKeySalt: 'sal-empleado', loginKeyHash: 'hash(0..15|sal-empleado)',
    ...EMPLOYEE_KEYS,
  },
  // Con clave de login pero sin claves de usuario (el esquema lo admite).
  {
    id: 2, name: 'Admin', email: 'admin@empresa.com', isAdmin: 1,
    loginKeySalt: 'sal-admin', loginKeyHash: 'hash(100..115|sal-admin)',
    publicKey: null, privateKeyIv: null, encryptedPrivateKey: null,
  },
  // Creado antes del paso 8: sin clave de login.
  { id: 3, name: 'Antiguo', email: 'antiguo@empresa.com', isAdmin: 0, loginKeySalt: null, loginKeyHash: null },
];

const inMemoryUserRepository = {
  async findByEmail(email) {
    return users.find((user) => user.email === email);
  },
};

// Servicio de clave de login falso: registra las llamadas y "hashea" de
// forma legible. Solo las claves conocidas con su sal dan su hash.
function createFakeLoginKeyService() {
  const calls = { verify: [], hash: [], fakeSalt: [] };
  function digest(loginKey, salt) {
    const [first, last] = [loginKey[0], loginKey[15]];
    return `hash(${first}..${last}|${salt})`;
  }
  return {
    calls,
    async hash(loginKey, salt) {
      calls.hash.push({ loginKey: Array.from(loginKey), salt });
      return digest(loginKey, salt);
    },
    async verify(loginKey, salt, expectedHash) {
      calls.verify.push({ loginKey: Array.from(loginKey), salt, expectedHash });
      return digest(loginKey, salt) === expectedHash;
    },
    fakeSalt(email) {
      calls.fakeSalt.push(email);
      return `sal-falsa(${email})`;
    },
    newSalt() {
      return 'sal-nueva';
    },
  };
}

describe('authService.login', () => {
  let signedClaims;
  let loginKeyService;
  let authService;

  beforeEach(() => {
    signedClaims = [];
    loginKeyService = createFakeLoginKeyService();
    authService = createAuthService({
      userRepository: inMemoryUserRepository,
      loginKeyService,
      tokenService: {
        async sign(claims) {
          signedClaims.push(claims);
          return `token-de-${claims.sub}`;
        },
      },
    });
  });

  it('devuelve el token, el usuario público y sus claves si la clave de login es correcta', async () => {
    const result = await authService.login({ email: 'empleado@empresa.com', loginKey: EMPLOYEE_KEY });
    assert.deepEqual(result, {
      token: 'token-de-1',
      user: { email: 'empleado@empresa.com', name: 'Empleado', isAdmin: false },
      keys: EMPLOYEE_KEYS,
    });
  });

  it('devuelve keys null si el usuario no tiene claves guardadas', async () => {
    const result = await authService.login({ email: 'admin@empresa.com', loginKey: ADMIN_KEY });
    assert.equal(result.keys, null);
    assert.equal(result.token, 'token-de-2');
  });

  it('verifica con la sal y el hash guardados del usuario', async () => {
    await authService.login({ email: 'empleado@empresa.com', loginKey: EMPLOYEE_KEY });
    assert.deepEqual(loginKeyService.calls.verify, [
      { loginKey: Array.from(EMPLOYEE_KEY), salt: 'sal-empleado', expectedHash: 'hash(0..15|sal-empleado)' },
    ]);
    assert.deepEqual(loginKeyService.calls.fakeSalt, []);
  });

  it('firma los claims de sesión del usuario', async () => {
    await authService.login({ email: 'admin@empresa.com', loginKey: ADMIN_KEY });
    assert.deepEqual(signedClaims, [{ sub: '2', email: 'admin@empresa.com', name: 'Admin', isAdmin: true }]);
  });

  it('no incluye la clave de login, la sal ni el hash en lo que devuelve', async () => {
    const result = await authService.login({ email: 'empleado@empresa.com', loginKey: EMPLOYEE_KEY });
    assert.deepEqual(Object.keys(result.user).sort(), ['email', 'isAdmin', 'name']);
    assert.deepEqual(Object.keys(result.keys).sort(), ['encryptedPrivateKey', 'privateKeyIv', 'publicKey']);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('sal-empleado'), false);
    assert.equal(serialized.includes('hash('), false);
  });

  it('rechaza una clave de login incorrecta sin firmar ningún token ni devolver claves', async () => {
    await assert.rejects(
      authService.login({ email: 'empleado@empresa.com', loginKey: WRONG_KEY }),
      (error) => error instanceof InvalidCredentialsError && !('keys' in error),
    );
    assert.equal(signedClaims.length, 0);
  });

  it('con un email inexistente verifica con la sal ficticia de ese email y rechaza', async () => {
    await assert.rejects(
      authService.login({ email: 'nadie@empresa.com', loginKey: EMPLOYEE_KEY }),
      InvalidCredentialsError,
    );
    assert.ok(loginKeyService.calls.fakeSalt.includes('nadie@empresa.com'));
    const [verification] = loginKeyService.calls.verify;
    assert.equal(verification.salt, 'sal-falsa(nadie@empresa.com)');
    assert.deepEqual(verification.loginKey, Array.from(EMPLOYEE_KEY));
    // El hash ficticio se calcula con el servicio, no es la sal ni vacío.
    assert.equal(typeof verification.expectedHash, 'string');
    assert.ok(verification.expectedHash.startsWith('hash('));
  });

  it('con un usuario sin clave de login verifica con la sal ficticia y rechaza', async () => {
    await assert.rejects(
      authService.login({ email: 'antiguo@empresa.com', loginKey: EMPLOYEE_KEY }),
      InvalidCredentialsError,
    );
    assert.equal(loginKeyService.calls.verify[0].salt, 'sal-falsa(antiguo@empresa.com)');
    assert.equal(signedClaims.length, 0);
  });
});
