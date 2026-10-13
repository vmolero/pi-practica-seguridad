import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAuthService } from '../src/application/auth-service.js';
import { InvalidCredentialsError } from '../src/application/errors.js';

const users = [
  { id: 1, name: 'Empleado', email: 'empleado@empresa.com', password: 'demo1234', isAdmin: 0 },
  { id: 2, name: 'Admin', email: 'admin@empresa.com', password: 'admin1234', isAdmin: 1 },
];

const inMemoryUserRepository = {
  async findByEmail(email) {
    return users.find((user) => user.email === email);
  },
};

const signedClaims = [];
const fakeTokenService = {
  async sign(claims) {
    signedClaims.push(claims);
    return `token-de-${claims.sub}`;
  },
};

const authService = createAuthService({
  userRepository: inMemoryUserRepository,
  tokenService: fakeTokenService,
});

describe('authService.login', () => {
  it('devuelve el token y el usuario público si las credenciales son correctas', async () => {
    const result = await authService.login({ email: 'empleado@empresa.com', password: 'demo1234' });
    assert.deepEqual(result, {
      token: 'token-de-1',
      user: { email: 'empleado@empresa.com', name: 'Empleado', isAdmin: false },
    });
  });

  it('firma los claims de sesión del usuario', async () => {
    signedClaims.length = 0;
    await authService.login({ email: 'admin@empresa.com', password: 'admin1234' });
    assert.deepEqual(signedClaims, [{ sub: '2', email: 'admin@empresa.com', name: 'Admin', isAdmin: true }]);
  });

  it('devuelve isAdmin true para un administrador', async () => {
    const { user } = await authService.login({ email: 'admin@empresa.com', password: 'admin1234' });
    assert.equal(user.isAdmin, true);
  });

  it('no incluye la contraseña en el usuario devuelto', async () => {
    const { user } = await authService.login({ email: 'empleado@empresa.com', password: 'demo1234' });
    assert.equal('password' in user, false);
  });

  it('no firma ningún token si las credenciales son incorrectas', async () => {
    signedClaims.length = 0;
    await assert.rejects(authService.login({ email: 'empleado@empresa.com', password: 'otra' }));
    assert.equal(signedClaims.length, 0);
  });

  it('rechaza una contraseña incorrecta', async () => {
    await assert.rejects(
      authService.login({ email: 'empleado@empresa.com', password: 'otra' }),
      InvalidCredentialsError,
    );
  });

  it('rechaza la contraseña con otras mayúsculas', async () => {
    await assert.rejects(
      authService.login({ email: 'empleado@empresa.com', password: 'DEMO1234' }),
      InvalidCredentialsError,
    );
  });

  it('rechaza un email inexistente con el mismo error', async () => {
    await assert.rejects(
      authService.login({ email: 'nadie@empresa.com', password: 'demo1234' }),
      InvalidCredentialsError,
    );
  });
});
