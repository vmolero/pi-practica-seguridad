import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './test-app.js';

const INVALID_CREDENTIALS = { error: 'Credenciales inválidas' };
const INVALID_REQUEST = { error: 'Petición de login no válida' };

describe('POST /api/public/login', () => {
  let server;
  let loginUrl;

  before(async () => {
    server = await startTestServer();
    loginUrl = `${server.baseUrl}/api/public/login`;
  });

  after(() => server.close());

  function postJson(body) {
    return fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  async function expectResponse(responsePromise, status, body) {
    const response = await responsePromise;
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
  }

  it('responde 200 con el token y el empleado, sin contraseña', async () => {
    const response = await postJson({ email: 'empleado@empresa.com', password: 'demo1234' });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['token', 'user']);
    assert.equal(body.token.split('.').length, 3);
    assert.deepEqual(body.user, { email: 'empleado@empresa.com', name: 'Empleado de prueba', isAdmin: false });
  });

  it('emite un token con los claims de sesión y sin contraseña', async () => {
    const response = await postJson({ email: 'empleado@empresa.com', password: 'demo1234' });
    const { token } = await response.json();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

    assert.deepEqual(Object.keys(claims).sort(), ['email', 'exp', 'iat', 'isAdmin', 'iss', 'name', 'sub']);
    assert.equal(claims.exp, claims.iat + 3600);
    assert.equal(JSON.stringify(claims).includes('demo1234'), false);
  });

  it('responde 200 con user.isAdmin true para un administrador', async () => {
    const response = await postJson({ email: 'admin@empresa.com', password: 'admin1234' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.isAdmin, true);
  });

  it('no distingue mayúsculas ni espacios en el email', async () => {
    const response = await postJson({ email: '  Empleado@EMPRESA.com ', password: 'demo1234' });
    assert.equal(response.status, 200);
  });

  it('responde 401 ante una contraseña incorrecta', async () => {
    await expectResponse(postJson({ email: 'empleado@empresa.com', password: 'otra' }), 401, INVALID_CREDENTIALS);
  });

  it('responde 401 con el mismo cuerpo ante un email inexistente', async () => {
    await expectResponse(postJson({ email: 'nadie@empresa.com', password: 'demo1234' }), 401, INVALID_CREDENTIALS);
  });

  it('distingue mayúsculas en la contraseña', async () => {
    await expectResponse(postJson({ email: 'empleado@empresa.com', password: 'DEMO1234' }), 401, INVALID_CREDENTIALS);
  });

  it('responde 400 si falta la contraseña', async () => {
    await expectResponse(postJson({ email: 'empleado@empresa.com' }), 400, INVALID_REQUEST);
  });

  it('responde 400 ante un email vacío o una contraseña numérica', async () => {
    await expectResponse(postJson({ email: '', password: 'demo1234' }), 400, INVALID_REQUEST);
    await expectResponse(postJson({ email: 'empleado@empresa.com', password: 1234 }), 400, INVALID_REQUEST);
  });

  it('responde 400 ante campos demasiado largos', async () => {
    await expectResponse(postJson({ email: `${'a'.repeat(250)}@b.com`, password: 'x' }), 400, INVALID_REQUEST);
    await expectResponse(postJson({ email: 'a@b.com', password: 'x'.repeat(129) }), 400, INVALID_REQUEST);
  });

  it('responde 400 ante JSON ilegible', async () => {
    await expectResponse(postJson('{"email": '), 400, INVALID_REQUEST);
  });

  it('responde 400 si el cuerpo no es JSON', async () => {
    const response = fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'email=empleado@empresa.com',
    });
    await expectResponse(response, 400, INVALID_REQUEST);
  });
});
