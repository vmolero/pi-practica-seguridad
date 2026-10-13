import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { startTestServer } from './test-app.js';

const CARDS_PATH = '/api/private/cards';
const INVALID = { error: 'Datos de tarjeta no válidos' };
const NOT_FOUND = { error: 'Tarjeta no encontrada' };
const FORBIDDEN = { error: 'Acceso denegado' };
const MASKED_KEYS = ['createdAt', 'expiryMonth', 'expiryYear', 'id', 'last4'];

const NEW_CARD = { number: '5555 5555 5555 4444', expiryMonth: 12, expiryYear: 2030, cvv: '123' };

// Mes actual y anterior (el servidor valida la caducidad con la fecha real).
const today = new Date();
const THIS_MONTH = { expiryMonth: today.getMonth() + 1, expiryYear: today.getFullYear() };
const LAST_MONTH = today.getMonth() === 0
  ? { expiryMonth: 12, expiryYear: today.getFullYear() - 1 }
  : { expiryMonth: today.getMonth(), expiryYear: today.getFullYear() };

function createClient(server) {
  async function token(email, password) {
    const response = await fetch(`${server.baseUrl}/api/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return (await response.json()).token;
  }

  function request(method, path, { token: bearer, body } = {}) {
    const headers = {};
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${server.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  return {
    token,
    request,
    employeeToken: () => token('empleado@empresa.com', 'demo1234'),
    adminToken: () => token('admin@empresa.com', 'admin1234'),
  };
}

async function expectResponse(responsePromise, status, body) {
  const response = await responsePromise;
  assert.equal(response.status, status);
  if (body !== undefined) assert.deepEqual(await response.json(), body);
  return response;
}

describe('tarjetas del usuario', () => {
  let server;
  let knex;
  let client;
  let employeeToken;
  let adminToken;
  let employeeId;
  let employeeCard;

  beforeEach(async () => {
    server = await startTestServer();
    knex = server.knex;
    client = createClient(server);
    employeeToken = await client.employeeToken();
    adminToken = await client.adminToken();
    employeeId = (await knex('USER').where({ email: 'empleado@empresa.com' }).first()).id;
    // Tarjeta de prueba del seed.
    employeeCard = await knex('CARD').first();
  });

  afterEach(() => server.close());

  const list = async (bearer) => (await (await client.request('GET', CARDS_PATH, { token: bearer })).json()).cards;
  const storedCard = (id) => knex('CARD').where({ id }).first();
  const cardPath = (id) => `${CARDS_PATH}/${id}`;

  describe('acceso', () => {
    it('responde 401 sin token', async () => {
      await expectResponse(client.request('GET', CARDS_PATH), 401, { error: 'No autenticado' });
    });

    it('el administrador no ve la tarjeta del empleado', async () => {
      const cards = await list(adminToken);
      assert.equal(cards.some((card) => card.id === employeeCard.id), false);
    });

    it('el administrador recibe 404 al modificar o borrar la tarjeta del empleado', async () => {
      await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), { token: adminToken, body: { cvv: '999' } }),
        404,
        NOT_FOUND,
      );
      await expectResponse(client.request('DELETE', cardPath(employeeCard.id), { token: adminToken }), 404, NOT_FOUND);
      assert.deepEqual(await storedCard(employeeCard.id), employeeCard);
    });

    it('responde 404 a un identificador que no es un UUID', async () => {
      await expectResponse(client.request('DELETE', cardPath('123'), { token: employeeToken }), 404, NOT_FOUND);
      await expectResponse(
        client.request('PATCH', cardPath('abc'), { token: employeeToken, body: { cvv: '999' } }),
        404,
        NOT_FOUND,
      );
    });

    it('responde 403 a un usuario relacionado que no es propietario', async () => {
      const adminId = (await knex('USER').where({ email: 'admin@empresa.com' }).first()).id;
      await knex('USER_CARD').insert({ userId: adminId, cardId: employeeCard.id, isOwner: false });

      await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), { token: adminToken, body: { cvv: '999' } }),
        403,
        FORBIDDEN,
      );
      await expectResponse(client.request('DELETE', cardPath(employeeCard.id), { token: adminToken }), 403, FORBIDDEN);
      assert.deepEqual(await storedCard(employeeCard.id), employeeCard);
    });
  });

  describe('listado y alta', () => {
    it('lista la tarjeta del empleado con exactamente los cinco campos', async () => {
      const response = await expectResponse(client.request('GET', CARDS_PATH, { token: employeeToken }), 200);
      const { cards } = await response.json();
      assert.equal(cards.length, 1);
      assert.deepEqual(Object.keys(cards[0]).sort(), MASKED_KEYS);
      assert.deepEqual(cards[0], {
        id: employeeCard.id,
        last4: '1111',
        expiryMonth: 12,
        expiryYear: 2030,
        createdAt: employeeCard.createdAt,
      });
    });

    it('devuelve una lista vacía a un usuario sin tarjetas', async () => {
      await expectResponse(client.request('GET', CARDS_PATH, { token: adminToken }), 200, { cards: [] });
    });

    it('da de alta una tarjeta enmascarada que aparece en el listado', async () => {
      const response = await expectResponse(
        client.request('POST', CARDS_PATH, { token: employeeToken, body: NEW_CARD }),
        201,
      );
      const created = await response.json();
      assert.deepEqual(Object.keys(created).sort(), MASKED_KEYS);
      assert.equal(created.last4, '4444');
      assert.equal(created.expiryMonth, 12);
      assert.equal(created.expiryYear, 2030);

      const cards = await list(employeeToken);
      assert.deepEqual(cards.map((card) => card.id), [employeeCard.id, created.id]);
      assert.equal((await storedCard(created.id)).number, '5555555555554444');
    });

    it('la tarjeta queda solo para quien la da de alta', async () => {
      const created = await (await client.request('POST', CARDS_PATH, { token: employeeToken, body: NEW_CARD })).json();
      const relations = await knex('USER_CARD').where({ cardId: created.id });
      assert.equal(relations.length, 1);
      assert.equal(relations[0].userId, employeeId);
      assert.equal(Boolean(relations[0].isOwner), true);
      assert.equal((await list(adminToken)).length, 0);
    });

    it('acepta una tarjeta que caduca este mes', async () => {
      await expectResponse(
        client.request('POST', CARDS_PATH, { token: employeeToken, body: { ...NEW_CARD, ...THIS_MONTH } }),
        201,
      );
    });
  });

  describe('modificación y borrado', () => {
    it('cambia solo la caducidad y conserva número y CVV', async () => {
      const response = await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), {
          token: employeeToken,
          body: { expiryMonth: 6, expiryYear: 2031 },
        }),
        200,
      );
      const updated = await response.json();
      assert.deepEqual(Object.keys(updated).sort(), MASKED_KEYS);
      assert.equal(updated.expiryMonth, 6);
      assert.equal(updated.expiryYear, 2031);
      assert.equal(updated.last4, '1111');

      const stored = await storedCard(employeeCard.id);
      assert.equal(stored.number, employeeCard.number);
      assert.equal(stored.cvv, employeeCard.cvv);
      assert.ok(stored.updatedAt >= employeeCard.updatedAt);
    });

    it('cambia el número', async () => {
      const response = await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), {
          token: employeeToken,
          body: { number: '5555 5555 5555 4444' },
        }),
        200,
      );
      assert.equal((await response.json()).last4, '4444');
    });

    it('borra la tarjeta propia y un segundo borrado responde 404', async () => {
      const response = await expectResponse(
        client.request('DELETE', cardPath(employeeCard.id), { token: employeeToken }),
        204,
      );
      assert.equal(await response.text(), '');
      assert.deepEqual(await list(employeeToken), []);
      assert.equal((await knex('USER_CARD').where({ cardId: employeeCard.id })).length, 0);

      await expectResponse(client.request('DELETE', cardPath(employeeCard.id), { token: employeeToken }), 404, NOT_FOUND);
    });
  });

  describe('validación', () => {
    const cardCount = async () => (await knex('CARD')).length;

    it('rechaza altas inválidas sin crear nada', async () => {
      const before = await cardCount();
      const invalidBodies = [
        { ...NEW_CARD, number: '4111111111111112' },
        { ...NEW_CARD, ...LAST_MONTH },
        { ...NEW_CARD, cvv: '12a' },
        { ...NEW_CARD, userId: employeeId },
        { number: NEW_CARD.number, expiryMonth: 12, expiryYear: 2030 },
        ['no', 'es', 'un', 'objeto'],
      ];
      for (const body of invalidBodies) {
        await expectResponse(client.request('POST', CARDS_PATH, { token: employeeToken, body }), 400, INVALID);
      }
      assert.equal(await cardCount(), before);
    });

    it('rechaza modificaciones inválidas sin cambiar la tarjeta', async () => {
      const invalidBodies = [
        {},
        { expiryMonth: 3 },
        { number: '4111111111111112' },
        { ...LAST_MONTH },
        { cvv: '12' },
        { cvv: '999', userId: employeeId },
      ];
      for (const body of invalidBodies) {
        await expectResponse(
          client.request('PATCH', cardPath(employeeCard.id), { token: employeeToken, body }),
          400,
          INVALID,
        );
      }
      assert.deepEqual(await storedCard(employeeCard.id), employeeCard);
    });

    it('rechaza un cuerpo que no es JSON válido', async () => {
      await expectResponse(client.request('POST', CARDS_PATH, { token: employeeToken, body: '{"number":' }), 400, INVALID);
      await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), { token: employeeToken, body: '{' }),
        400,
        INVALID,
      );
    });
  });
});
