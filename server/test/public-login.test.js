import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loginKeyFor } from './helpers.js';
import { startTestServer } from './test-app.js';

const INVALID_CREDENTIALS = { error: 'Credenciales inválidas' };
const INVALID_REQUEST = { error: 'Petición de login no válida' };

const EMPLOYEE_KEY = await loginKeyFor('demo1234');
const ADMIN_KEY = await loginKeyFor('admin1234');

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

  it('responde 200 con el token, el empleado y sus claves, sin sal ni hash', async () => {
    const response = await postJson({ email: 'empleado@empresa.com', loginKey: EMPLOYEE_KEY });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['keys', 'token', 'user']);
    assert.equal(body.token.split('.').length, 3);
    assert.deepEqual(body.user, { email: 'empleado@empresa.com', name: 'Empleado de prueba', isAdmin: false });
    // Las claves son exactamente las de la fila sembrada.
    const row = await server.knex('USER').where({ email: 'empleado@empresa.com' }).first();
    assert.deepEqual(body.keys, {
      publicKey: row.publicKey, privateKeyIv: row.privateKeyIv, encryptedPrivateKey: row.encryptedPrivateKey,
    });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('loginKey'), false);
    assert.equal(serialized.includes(EMPLOYEE_KEY), false);
    assert.equal(serialized.includes(row.loginKeySalt), false);
    assert.equal(serialized.includes(row.loginKeyHash), false);
  });

  it('responde 200 con keys null para un usuario con la clave privada cifrada a NULL', async () => {
    await server.knex('USER').where({ email: 'admin@empresa.com' }).update({ encryptedPrivateKey: null });
    try {
      const response = await postJson({ email: 'admin@empresa.com', loginKey: ADMIN_KEY });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).keys, null);
    } finally {
      const { encryptedPrivateKey } = await server.knex('USER').where({ email: 'empleado@empresa.com' }).first();
      // Restaura un valor no nulo (el del empleado sirve: solo importa que no sea NULL).
      await server.knex('USER').where({ email: 'admin@empresa.com' }).update({ encryptedPrivateKey });
    }
  });

  it('emite un token con los claims de sesión y sin la clave de login', async () => {
    const response = await postJson({ email: 'empleado@empresa.com', loginKey: EMPLOYEE_KEY });
    const { token } = await response.json();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

    assert.deepEqual(Object.keys(claims).sort(), ['email', 'exp', 'iat', 'isAdmin', 'iss', 'name', 'sub']);
    assert.equal(claims.exp, claims.iat + 3600);
    assert.equal(JSON.stringify(claims).includes(EMPLOYEE_KEY), false);
  });

  it('responde 200 con user.isAdmin true y sus claves para un administrador', async () => {
    const response = await postJson({ email: 'admin@empresa.com', loginKey: ADMIN_KEY });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.isAdmin, true);
    const row = await server.knex('USER').where({ email: 'admin@empresa.com' }).first();
    assert.equal(body.keys.publicKey, row.publicKey);
  });

  it('no distingue mayúsculas ni espacios en el email', async () => {
    const response = await postJson({ email: '  Empleado@EMPRESA.com ', loginKey: EMPLOYEE_KEY });
    assert.equal(response.status, 200);
  });

  it('responde 401 ante una clave de login incorrecta, sin claves en el cuerpo', async () => {
    await expectResponse(postJson({ email: 'empleado@empresa.com', loginKey: ADMIN_KEY }), 401, INVALID_CREDENTIALS);
  });

  it('responde 401 ante la clave derivada de la contraseña con otras mayúsculas', async () => {
    const key = await loginKeyFor('DEMO1234');
    await expectResponse(postJson({ email: 'empleado@empresa.com', loginKey: key }), 401, INVALID_CREDENTIALS);
  });

  it('responde 401 con el mismo cuerpo ante un email inexistente', async () => {
    await expectResponse(postJson({ email: 'nadie@empresa.com', loginKey: EMPLOYEE_KEY }), 401, INVALID_CREDENTIALS);
  });

  it('responde 401 con el mismo cuerpo ante un usuario sin clave de login', async () => {
    await server.knex('USER').insert({ name: 'Antiguo', email: 'antiguo@empresa.com', isAdmin: false });
    await expectResponse(postJson({ email: 'antiguo@empresa.com', loginKey: EMPLOYEE_KEY }), 401, INVALID_CREDENTIALS);
  });

  it('responde 400 si falta la clave de login', async () => {
    await expectResponse(postJson({ email: 'empleado@empresa.com' }), 400, INVALID_REQUEST);
  });

  it('responde 400 ante un email vacío o una clave numérica', async () => {
    await expectResponse(postJson({ email: '', loginKey: EMPLOYEE_KEY }), 400, INVALID_REQUEST);
    await expectResponse(postJson({ email: 'empleado@empresa.com', loginKey: 1234 }), 400, INVALID_REQUEST);
  });

  it('responde 400 ante una clave de 15 bytes o que no es base64', async () => {
    const fifteen = Buffer.alloc(15, 1).toString('base64');
    await expectResponse(postJson({ email: 'empleado@empresa.com', loginKey: fifteen }), 400, INVALID_REQUEST);
    await expectResponse(postJson({ email: 'empleado@empresa.com', loginKey: '!'.repeat(24) }), 400, INVALID_REQUEST);
  });

  it('responde 400 si llega password como en los pasos anteriores', async () => {
    await expectResponse(postJson({ email: 'empleado@empresa.com', password: 'demo1234' }), 400, INVALID_REQUEST);
  });

  it('responde 400 ante un email demasiado largo', async () => {
    await expectResponse(postJson({ email: `${'a'.repeat(250)}@b.com`, loginKey: EMPLOYEE_KEY }), 400, INVALID_REQUEST);
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
