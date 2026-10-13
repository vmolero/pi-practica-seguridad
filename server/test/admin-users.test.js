import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { startTestServer } from './test-app.js';

const USERS_PATH = '/api/private/admin/users';
const FORBIDDEN = { error: 'Acceso denegado' };
const INVALID = { error: 'Datos de usuario no válidos' };
const NOT_FOUND = { error: 'Usuario no encontrado' };
const DUPLICATE = { error: 'Ya existe un usuario con ese email' };
const SELF_DELETION = { error: 'No puedes eliminar tu propia cuenta' };

const NEW_USER = { name: 'Ana Pérez', email: ' Ana@Empresa.com ', password: 'inicial123' };

// Cliente HTTP mínimo contra un servidor de pruebas.
function createClient(server) {
  async function login(email, password) {
    const response = await fetch(`${server.baseUrl}/api/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { status: response.status, token: response.ok ? (await response.json()).token : null };
  }

  function request(method, path, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${server.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  return {
    login,
    request,
    adminToken: async () => (await login('admin@empresa.com', 'admin1234')).token,
    employeeToken: async () => (await login('empleado@empresa.com', 'demo1234')).token,
  };
}

async function expectResponse(responsePromise, status, body) {
  const response = await responsePromise;
  assert.equal(response.status, status);
  if (body !== undefined) assert.deepEqual(await response.json(), body);
  return response;
}

async function listUsers(client, token) {
  const response = await client.request('GET', USERS_PATH, { token });
  return (await response.json()).users;
}

describe('administración de usuarios: acceso', () => {
  let server;
  let client;

  before(async () => {
    server = await startTestServer();
    client = createClient(server);
  });

  after(() => server.close());

  it('responde 401 sin token', async () => {
    await expectResponse(client.request('GET', USERS_PATH), 401, { error: 'No autenticado' });
  });

  it('responde 403 a un empleado que pide la lista', async () => {
    await expectResponse(client.request('GET', USERS_PATH, { token: await client.employeeToken() }), 403, FORBIDDEN);
  });

  it('responde 403 a un empleado que intenta crear un usuario y no lo crea', async () => {
    await expectResponse(
      client.request('POST', USERS_PATH, { token: await client.employeeToken(), body: NEW_USER }),
      403,
      FORBIDDEN,
    );
    const emails = (await listUsers(client, await client.adminToken())).map((user) => user.email);
    assert.equal(emails.includes('ana@empresa.com'), false);
  });

  it('responde 403, no 400, a un empleado que envía JSON ilegible', async () => {
    await expectResponse(
      client.request('POST', USERS_PATH, { token: await client.employeeToken(), body: '{roto' }),
      403,
      FORBIDDEN,
    );
  });

  it('lista los usuarios ordenados por id y sin contraseña', async () => {
    const response = await expectResponse(client.request('GET', USERS_PATH, { token: await client.adminToken() }), 200);
    const { users } = await response.json();
    assert.deepEqual(users.map((user) => user.email), ['empleado@empresa.com', 'admin@empresa.com']);
    for (const user of users) {
      assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'isAdmin', 'name']);
    }
    assert.deepEqual(users.map((user) => user.isAdmin), [false, true]);
  });
});

describe('administración de usuarios: operaciones', () => {
  let server;
  let client;
  let adminToken;

  beforeEach(async () => {
    server = await startTestServer();
    client = createClient(server);
    adminToken = await client.adminToken();
  });

  afterEach(() => server.close());

  async function findUser(email) {
    return (await listUsers(client, adminToken)).find((user) => user.email === email);
  }

  it('da de alta un empleado con el email normalizado y puede iniciar sesión', async () => {
    const response = await expectResponse(client.request('POST', USERS_PATH, { token: adminToken, body: NEW_USER }), 201);
    const created = await response.json();
    assert.deepEqual(Object.keys(created).sort(), ['email', 'id', 'isAdmin', 'name']);
    assert.equal(created.email, 'ana@empresa.com');
    assert.equal(created.name, 'Ana Pérez');
    assert.equal(created.isAdmin, false);
    assert.equal((await client.login('ana@empresa.com', 'inicial123')).status, 200);
  });

  it('da de alta otro administrador que puede acceder al panel', async () => {
    const body = { ...NEW_USER, isAdmin: true };
    const created = await (await expectResponse(client.request('POST', USERS_PATH, { token: adminToken, body }), 201)).json();
    assert.equal(created.isAdmin, true);
    const { token } = await client.login('ana@empresa.com', 'inicial123');
    await expectResponse(client.request('GET', USERS_PATH, { token }), 200);
  });

  it('responde 409 a un email repetido aunque cambien las mayúsculas', async () => {
    const body = { ...NEW_USER, email: 'ADMIN@empresa.com' };
    await expectResponse(client.request('POST', USERS_PATH, { token: adminToken, body }), 409, DUPLICATE);
    assert.equal((await listUsers(client, adminToken)).length, 2);
  });

  it('responde 400 a altas no válidas sin crear nada', async () => {
    const { password: _password, ...withoutPassword } = NEW_USER;
    const invalidBodies = [
      withoutPassword,
      { ...NEW_USER, password: '1234567' },
      { ...NEW_USER, email: 'ana.empresa.com' },
      { ...NEW_USER, isAdmin: 'sí' },
      '{roto',
    ];
    for (const body of invalidBodies) {
      await expectResponse(client.request('POST', USERS_PATH, { token: adminToken, body }), 400, INVALID);
    }
    assert.equal((await listUsers(client, adminToken)).length, 2);
  });

  it('renombra un usuario quitando los espacios de los extremos', async () => {
    const employee = await findUser('empleado@empresa.com');
    const response = await expectResponse(
      client.request('PATCH', `${USERS_PATH}/${employee.id}`, { token: adminToken, body: { name: '  Ana García ' } }),
      200,
    );
    assert.deepEqual(await response.json(), { ...employee, name: 'Ana García' });
    assert.equal((await findUser('empleado@empresa.com')).name, 'Ana García');
  });

  it('responde 400 a un cambio que incluye algo más que el nombre y no cambia nada', async () => {
    const employee = await findUser('empleado@empresa.com');
    await expectResponse(
      client.request('PATCH', `${USERS_PATH}/${employee.id}`, { token: adminToken, body: { name: 'Ana', isAdmin: true } }),
      400,
      INVALID,
    );
    assert.deepEqual(await findUser('empleado@empresa.com'), employee);
  });

  it('responde 404 al renombrar un id inexistente o no numérico', async () => {
    const body = { name: 'Nadie' };
    await expectResponse(client.request('PATCH', `${USERS_PATH}/9999`, { token: adminToken, body }), 404, NOT_FOUND);
    await expectResponse(client.request('PATCH', `${USERS_PATH}/abc`, { token: adminToken, body }), 404, NOT_FOUND);
  });

  it('elimina un empleado, que ya no puede iniciar sesión', async () => {
    const employee = await findUser('empleado@empresa.com');
    const response = await expectResponse(client.request('DELETE', `${USERS_PATH}/${employee.id}`, { token: adminToken }), 204);
    assert.equal(await response.text(), '');
    assert.equal(await findUser('empleado@empresa.com'), undefined);
    assert.equal((await client.login('empleado@empresa.com', 'demo1234')).status, 401);
  });

  it('responde 404 al eliminar un id inexistente', async () => {
    await expectResponse(client.request('DELETE', `${USERS_PATH}/9999`, { token: adminToken }), 404, NOT_FOUND);
  });

  it('impide que un administrador se elimine a sí mismo', async () => {
    const admin = await findUser('admin@empresa.com');
    await expectResponse(client.request('DELETE', `${USERS_PATH}/${admin.id}`, { token: adminToken }), 400, SELF_DELETION);
    assert.ok(await findUser('admin@empresa.com'));
  });

  it('responde 403 a un administrador eliminado cuyo token aún no ha caducado', async () => {
    await client.request('POST', USERS_PATH, { token: adminToken, body: { ...NEW_USER, isAdmin: true } });
    const { token: secondAdminToken } = await client.login('ana@empresa.com', 'inicial123');
    const admin = await findUser('admin@empresa.com');

    await expectResponse(client.request('DELETE', `${USERS_PATH}/${admin.id}`, { token: secondAdminToken }), 204);
    await expectResponse(client.request('GET', USERS_PATH, { token: adminToken }), 403, FORBIDDEN);
  });
});
