import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { abrirClavePrivada } from '../../client/src/security/claves-usuario.js';
import { descifrarTarjeta } from '../../client/src/security/tarjetas-cifradas.js';
import { employeeKeys, encryptedTestCard, loginKeyFor } from './helpers.js';
import { startTestServer } from './test-app.js';

const CARDS_PATH = '/api/private/cards';
const INVALID = { error: 'Datos de tarjeta no válidos' };
const NOT_FOUND = { error: 'Tarjeta no encontrada' };
const FORBIDDEN = { error: 'Acceso denegado' };
const CONFLICT = { error: 'La tarjeta ya existe' };
const ENCRYPTED_KEYS = ['createdAt', 'cvv', 'expiry', 'id', 'number', 'wrappedKey'];
const PLAIN = ['4111111111111111', '12/2030', '123', '5555555555554444'];

function createClient(server) {
  async function token(email, password) {
    const response = await fetch(`${server.baseUrl}/api/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, loginKey: await loginKeyFor(password) }),
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

// Tarjeta tal como la devuelve la API a partir de su fila en CARD y USER_CARD.
function encryptedView(row, relation) {
  return {
    id: row.id,
    number: { iv: row.numberIv, ciphertext: row.numberCiphertext },
    expiry: { iv: row.expiryIv, ciphertext: row.expiryCiphertext },
    cvv: { iv: row.cvvIv, ciphertext: row.cvvCiphertext },
    wrappedKey: relation.wrappedKey,
    createdAt: row.createdAt,
  };
}

describe('tarjetas del usuario', () => {
  let server;
  let knex;
  let client;
  let employeeToken;
  let adminToken;
  let employeeId;
  let employeeCard;
  let keys;

  beforeEach(async () => {
    server = await startTestServer();
    knex = server.knex;
    client = createClient(server);
    employeeToken = await client.employeeToken();
    adminToken = await client.adminToken();
    employeeId = (await knex('USER').where({ email: 'empleado@empresa.com' }).first()).id;
    keys = await employeeKeys(knex);
    // Tarjeta de prueba del seed.
    employeeCard = await knex('CARD').first();
  });

  afterEach(() => server.close());

  const list = async (bearer) => (await (await client.request('GET', CARDS_PATH, { token: bearer })).json()).cards;
  const storedCard = (id) => knex('CARD').where({ id }).first();
  const relationOf = (cardId, userId) => knex('USER_CARD').where({ cardId, userId }).first();
  const cardPath = (id) => `${CARDS_PATH}/${id}`;
  const newCard = (overrides) => encryptedTestCard(keys.publicKey, overrides);
  const decrypt = async (card) => descifrarTarjeta(await abrirClavePrivada('demo1234', keys), card);
  const cvvChange = async () => (({ cvv }) => ({ cvv }))(await newCard({ id: employeeCard.id, cvv: '999' }));

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
        client.request('PATCH', cardPath(employeeCard.id), { token: adminToken, body: await cvvChange() }),
        404,
        NOT_FOUND,
      );
      await expectResponse(client.request('DELETE', cardPath(employeeCard.id), { token: adminToken }), 404, NOT_FOUND);
      assert.deepEqual(await storedCard(employeeCard.id), employeeCard);
    });

    it('responde 404 a un identificador que no es un UUID', async () => {
      await expectResponse(client.request('DELETE', cardPath('123'), { token: employeeToken }), 404, NOT_FOUND);
      await expectResponse(
        client.request('PATCH', cardPath('abc'), { token: employeeToken, body: await cvvChange() }),
        404,
        NOT_FOUND,
      );
    });

    it('responde 403 a un usuario relacionado que no es propietario', async () => {
      const adminId = (await knex('USER').where({ email: 'admin@empresa.com' }).first()).id;
      await knex('USER_CARD').insert({ userId: adminId, cardId: employeeCard.id, isOwner: false, wrappedKey: 'w' });

      await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), { token: adminToken, body: await cvvChange() }),
        403,
        FORBIDDEN,
      );
      await expectResponse(client.request('DELETE', cardPath(employeeCard.id), { token: adminToken }), 403, FORBIDDEN);
      assert.deepEqual(await storedCard(employeeCard.id), employeeCard);
    });
  });

  describe('listado y alta', () => {
    it('lista la tarjeta del empleado cifrada, igual que en la base de datos', async () => {
      const response = await expectResponse(client.request('GET', CARDS_PATH, { token: employeeToken }), 200);
      const { cards } = await response.json();
      assert.equal(cards.length, 1);
      assert.deepEqual(Object.keys(cards[0]).sort(), ENCRYPTED_KEYS);
      assert.deepEqual(cards[0], encryptedView(employeeCard, await relationOf(employeeCard.id, employeeId)));
    });

    it('la tarjeta de la semilla se descifra con la clave privada del empleado', async () => {
      const [card] = await list(employeeToken);
      assert.deepEqual(await decrypt(card), { id: card.id, number: '4111111111111111', expiry: '12/2030', cvv: '123' });
    });

    it('no envía ningún valor en claro', async () => {
      const text = await (await client.request('GET', CARDS_PATH, { token: employeeToken })).text();
      for (const plain of PLAIN) assert.equal(text.includes(plain), false, plain);
      const row = await storedCard(employeeCard.id);
      for (const plain of PLAIN) assert.equal(JSON.stringify(row).includes(plain), false, plain);
    });

    it('devuelve una lista vacía a un usuario sin tarjetas', async () => {
      await expectResponse(client.request('GET', CARDS_PATH, { token: adminToken }), 200, { cards: [] });
    });

    it('da de alta una tarjeta cifrada que aparece en el listado y se descifra', async () => {
      const body = await newCard();
      const response = await expectResponse(
        client.request('POST', CARDS_PATH, { token: employeeToken, body }),
        201,
      );
      const created = await response.json();
      assert.deepEqual(Object.keys(created).sort(), ENCRYPTED_KEYS);
      const { createdAt, ...sent } = created;
      assert.deepEqual(sent, body);

      const cards = await list(employeeToken);
      assert.deepEqual(cards.map((card) => card.id), [employeeCard.id, created.id]);
      assert.deepEqual(cards[1], created);
      assert.equal((await decrypt(cards[1])).number, '5555555555554444');
    });

    it('normaliza el id a minúsculas', async () => {
      const body = await newCard();
      const created = await (await client.request('POST', CARDS_PATH, {
        token: employeeToken, body: { ...body, id: body.id.toUpperCase() },
      })).json();
      assert.equal(created.id, body.id);
    });

    it('la tarjeta queda solo para quien la da de alta, con su clave envuelta', async () => {
      const body = await newCard();
      const created = await (await client.request('POST', CARDS_PATH, { token: employeeToken, body })).json();
      const relations = await knex('USER_CARD').where({ cardId: created.id });
      assert.equal(relations.length, 1);
      assert.equal(relations[0].userId, employeeId);
      assert.equal(Boolean(relations[0].isOwner), true);
      assert.equal(relations[0].wrappedKey, body.wrappedKey);
      assert.equal((await list(adminToken)).length, 0);
    });

    it('responde 409 a un id repetido, también de otro usuario, sin cambiar nada', async () => {
      const body = await newCard({ id: employeeCard.id });
      await expectResponse(client.request('POST', CARDS_PATH, { token: employeeToken, body }), 409, CONFLICT);
      await expectResponse(client.request('POST', CARDS_PATH, { token: adminToken, body }), 409, CONFLICT);
      assert.deepEqual(await storedCard(employeeCard.id), employeeCard);
      assert.equal((await knex('USER_CARD').where({ cardId: employeeCard.id })).length, 1);
      assert.equal((await list(adminToken)).length, 0);
    });

    it('acepta un cifrado que no corresponde a ninguna tarjeta real', async () => {
      const body = await newCard({ number: 'no es un numero', cvv: 'abcd' });
      await expectResponse(client.request('POST', CARDS_PATH, { token: employeeToken, body }), 201);
    });
  });

  describe('modificación y borrado', () => {
    it('sustituye solo la caducidad y conserva número, CVV y clave envuelta', async () => {
      const { expiry } = await newCard({ id: employeeCard.id, expiry: '06/2031' });
      const response = await expectResponse(
        client.request('PATCH', cardPath(employeeCard.id), { token: employeeToken, body: { expiry } }),
        200,
      );
      const updated = await response.json();
      assert.deepEqual(Object.keys(updated).sort(), ENCRYPTED_KEYS);
      assert.deepEqual(updated.expiry, expiry);
      assert.deepEqual(updated.number, { iv: employeeCard.numberIv, ciphertext: employeeCard.numberCiphertext });
      assert.deepEqual(updated.cvv, { iv: employeeCard.cvvIv, ciphertext: employeeCard.cvvCiphertext });
      assert.equal(updated.wrappedKey, (await relationOf(employeeCard.id, employeeId)).wrappedKey);

      const stored = await storedCard(employeeCard.id);
      assert.equal(stored.expiryCiphertext, expiry.ciphertext);
      assert.ok(stored.updatedAt >= employeeCard.updatedAt);
    });

    it('la tarjeta modificada se descifra con los valores nuevos', async () => {
      // Valores cifrados con la misma K_t de la tarjeta de la semilla.
      const { abrirClaveTarjeta, cifrarValores } = await import('../../client/src/security/tarjetas-cifradas.js');
      const [card] = await list(employeeToken);
      const K_t = await abrirClaveTarjeta(await abrirClavePrivada('demo1234', keys), card.wrappedKey);
      const changes = await cifrarValores(K_t, card.id, { number: '5555555555554444' });

      await expectResponse(client.request('PATCH', cardPath(card.id), { token: employeeToken, body: changes }), 200);
      const [updated] = await list(employeeToken);
      assert.deepEqual(await decrypt(updated), { id: card.id, number: '5555555555554444', expiry: '12/2030', cvv: '123' });
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

    it('rechaza altas con estructura inválida sin crear nada', async () => {
      const before = await cardCount();
      const valid = await newCard();
      const { wrappedKey, ...withoutKey } = valid;
      const invalidBodies = [
        { ...valid, id: '123' },
        { ...valid, wrappedKey: 'no-es-base64!' },
        { ...valid, number: { ...valid.number, ciphertext: valid.number.ciphertext.slice(0, -4) } },
        { ...valid, cvv: { ...valid.cvv, plain: '123' } },
        { ...valid, userId: employeeId },
        { ...valid, last4: '4444' },
        withoutKey,
        ['no', 'es', 'un', 'objeto'],
      ];
      for (const body of invalidBodies) {
        await expectResponse(client.request('POST', CARDS_PATH, { token: employeeToken, body }), 400, INVALID);
      }
      assert.equal(await cardCount(), before);
    });

    it('rechaza modificaciones inválidas sin cambiar la tarjeta', async () => {
      const valid = await newCard({ id: employeeCard.id });
      const invalidBodies = [
        {},
        { id: valid.id },
        { wrappedKey: valid.wrappedKey },
        { cvv: valid.cvv, wrappedKey: valid.wrappedKey },
        { number: { iv: valid.number.iv, ciphertext: 'abcd' } },
        { cvv: valid.cvv, userId: employeeId },
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
