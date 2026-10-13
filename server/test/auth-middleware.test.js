import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvalidTokenError } from '../src/application/errors.js';
import { createAuthMiddleware } from '../src/infrastructure/http/auth-middleware.js';

const VALID_CLAIMS = { sub: '7', email: 'ana@empresa.com', name: 'Ana', isAdmin: false, iss: 'x', iat: 1, exp: 2 };

// tokenService falso: 'valido' → claims válidos, 'incompleto' → sin email,
// 'roto' → error inesperado, cualquier otro → InvalidTokenError.
const fakeTokenService = {
  async verify(token) {
    if (token === 'valido') return VALID_CLAIMS;
    if (token === 'incompleto') return { ...VALID_CLAIMS, email: undefined };
    if (token === 'roto') throw new Error('fallo inesperado');
    throw new InvalidTokenError();
  },
};

const authenticate = createAuthMiddleware({ tokenService: fakeTokenService });

async function run(authorization) {
  const request = { headers: authorization === undefined ? {} : { authorization } };
  const response = {
    statusCode: undefined,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
  };
  const nextCalls = [];
  await authenticate(request, response, (...args) => nextCalls.push(args));
  return { request, response, nextCalls };
}

function assertUnauthenticated({ request, response, nextCalls }) {
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No autenticado' });
  assert.equal(response.headers['WWW-Authenticate'], 'Bearer');
  assert.equal(nextCalls.length, 0);
  assert.equal(request.user, undefined);
}

describe('authMiddleware', () => {
  it('deja el usuario en request.user y llama a next() con un token válido', async () => {
    const { request, response, nextCalls } = await run('Bearer valido');
    assert.deepEqual(request.user, { id: 7, email: 'ana@empresa.com', name: 'Ana', isAdmin: false });
    assert.deepEqual(nextCalls, [[]]);
    assert.equal(response.statusCode, undefined);
  });

  it('acepta el esquema en minúsculas', async () => {
    const { request } = await run('bearer valido');
    assert.equal(request.user.id, 7);
  });

  it('responde 401 sin cabecera Authorization', async () => {
    assertUnauthenticated(await run(undefined));
  });

  it('responde 401 con otro esquema', async () => {
    assertUnauthenticated(await run('Basic dXNlcjpwYXNz'));
  });

  it('responde 401 con Bearer sin token', async () => {
    assertUnauthenticated(await run('Bearer'));
    assertUnauthenticated(await run('Bearer '));
  });

  it('responde 401 si verify lanza InvalidTokenError', async () => {
    assertUnauthenticated(await run('Bearer manipulado'));
  });

  it('responde 401 si los claims están incompletos', async () => {
    assertUnauthenticated(await run('Bearer incompleto'));
  });

  it('pasa a next(error) un error inesperado de verify', async () => {
    const { response, nextCalls } = await run('Bearer roto');
    assert.equal(response.statusCode, undefined);
    assert.equal(nextCalls.length, 1);
    assert.equal(nextCalls[0][0].message, 'fallo inesperado');
  });
});
