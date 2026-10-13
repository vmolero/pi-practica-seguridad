import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTokenService } from '../src/infrastructure/security/token-service.js';
import { TOKEN_ISSUER } from '../src/infrastructure/security/issuer.js';
import { createTestTokenService, startTestServer } from './test-app.js';

const UNAUTHENTICATED = { error: 'No autenticado' };
const EMPLOYEE_CLAIMS = { sub: '1', email: 'empleado@empresa.com', name: 'Empleado de prueba', isAdmin: false };

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('sección privada: GET /api/private/me', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(() => server.close());

  async function login(email, password) {
    const response = await fetch(`${server.baseUrl}/api/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return (await response.json()).token;
  }

  function getMe(authorization, path = '/api/private/me') {
    const headers = authorization === undefined ? {} : { Authorization: authorization };
    return fetch(`${server.baseUrl}${path}`, { headers });
  }

  async function expectUnauthenticated(responsePromise) {
    const response = await responsePromise;
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(await response.json(), UNAUTHENTICATED);
  }

  it('devuelve el empleado autenticado sin contraseña', async () => {
    const token = await login('empleado@empresa.com', 'demo1234');
    const response = await getMe(`Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      email: 'empleado@empresa.com',
      name: 'Empleado de prueba',
      isAdmin: false,
    });
  });

  it('devuelve isAdmin true para el administrador', async () => {
    const token = await login('admin@empresa.com', 'admin1234');
    const response = await getMe(`Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).isAdmin, true);
  });

  it('acepta el esquema bearer en minúsculas', async () => {
    const token = await login('empleado@empresa.com', 'demo1234');
    assert.equal((await getMe(`bearer ${token}`)).status, 200);
  });

  it('responde 401 sin cabecera', async () => {
    await expectUnauthenticated(getMe(undefined));
  });

  it('responde 401 con otro esquema o sin token', async () => {
    await expectUnauthenticated(getMe('Basic dXNlcjpwYXNz'));
    await expectUnauthenticated(getMe('Bearer'));
  });

  it('responde 401 con un token ilegible', async () => {
    await expectUnauthenticated(getMe('Bearer esto-no-es-un-jwt'));
  });

  it('responde 401 con un token manipulado para hacerse administrador', async () => {
    const [header, payload, signature] = (await login('empleado@empresa.com', 'demo1234')).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const tampered = base64url({ ...claims, isAdmin: true });
    await expectUnauthenticated(getMe(`Bearer ${header}.${tampered}.${signature}`));
  });

  it('responde 401 con un token firmado con otro secreto', async () => {
    const other = createTokenService({
      secret: 'otro-secreto-distinto-de-al-menos-32-caracteres',
      ttlSeconds: 3600,
      issuer: TOKEN_ISSUER,
    });
    await expectUnauthenticated(getMe(`Bearer ${await other.sign(EMPLOYEE_CLAIMS)}`));
  });

  it('responde 401 con un token caducado', async () => {
    const past = Date.now() - 2 * 3600 * 1000;
    const expired = await createTestTokenService({ now: () => past }).sign(EMPLOYEE_CLAIMS);
    await expectUnauthenticated(getMe(`Bearer ${expired}`));
  });

  it('responde 401 con alg: none', async () => {
    const [, payload] = (await login('empleado@empresa.com', 'demo1234')).split('.');
    const header = base64url({ alg: 'none', typ: 'JWT' });
    await expectUnauthenticated(getMe(`Bearer ${header}.${payload}.`));
  });

  it('responde 401 con un token válido al que le faltan claims', async () => {
    const { email, ...withoutEmail } = EMPLOYEE_CLAIMS;
    assert.ok(email);
    const token = await createTestTokenService().sign(withoutEmail);
    await expectUnauthenticated(getMe(`Bearer ${token}`));
  });

  it('responde 401, no 404, a una ruta privada inexistente sin token', async () => {
    await expectUnauthenticated(getMe(undefined, '/api/private/no-existe'));
  });

  it('responde 404 a una ruta privada inexistente con token', async () => {
    const token = await login('empleado@empresa.com', 'demo1234');
    assert.equal((await getMe(`Bearer ${token}`, '/api/private/no-existe')).status, 404);
  });

  it('mantiene /api/health y el login accesibles sin token', async () => {
    assert.equal((await fetch(`${server.baseUrl}/api/health`)).status, 200);
    assert.ok(await login('empleado@empresa.com', 'demo1234'));
  });
});
