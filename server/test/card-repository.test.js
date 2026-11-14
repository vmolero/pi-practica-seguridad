import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DuplicateCardError, createCardRepository } from '../src/infrastructure/database/card-repository.js';
import { createTestDatabase, encryptedTestCard, getTestUserKeys } from './helpers.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const isConstraintError = (error) => String(error.code).startsWith('SQLITE_CONSTRAINT');

describe('cardRepository', () => {
  let database;
  let knex;
  let cards;
  let employeeId;
  let adminId;
  let publicKey;

  beforeEach(async () => {
    database = await createTestDatabase();
    knex = database.knex;
    cards = createCardRepository(knex);
    employeeId = (await knex('USER').where({ email: 'empleado@empresa.com' }).first()).id;
    adminId = (await knex('USER').where({ email: 'admin@empresa.com' }).first()).id;
    ({ publicKey } = await getTestUserKeys());
  });

  afterEach(() => database.cleanup());

  const relationsOf = (cardId) => knex('USER_CARD').where({ cardId });
  const newCard = (overrides) => encryptedTestCard(publicKey, overrides);
  const share = (cardId, userId) => knex('USER_CARD').insert({ userId, cardId, isOwner: false, wrappedKey: 'w-compartida' });

  describe('esquema', () => {
    it('rechaza una pareja (userId, cardId) repetida', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await assert.rejects(share(card.id, adminId), isConstraintError);
    });

    it('rechaza una relación con un usuario inexistente', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await assert.rejects(share(card.id, 9999), isConstraintError);
    });

    it('rechaza un segundo propietario', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await assert.rejects(
        knex('USER_CARD').insert({ userId: employeeId, cardId: card.id, isOwner: true, wrappedKey: 'w' }),
        isConstraintError,
      );
    });

    it('rechaza una relación sin clave envuelta', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await assert.rejects(
        knex('USER_CARD').insert({ userId: employeeId, cardId: card.id, isOwner: false }),
        isConstraintError,
      );
    });

    it('acepta una relación sin propiedad, preparada para compartir', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await share(card.id, employeeId);
      assert.equal((await relationsOf(card.id)).length, 2);
    });
  });

  describe('alta', () => {
    it('guarda los valores cifrados tal cual, con el id del cliente, y fija las fechas', async () => {
      const data = await newCard();
      const card = await cards.createForOwner(adminId, data);
      assert.equal(card.id, data.id);
      assert.deepEqual(card.number, data.number);
      assert.deepEqual(card.expiry, data.expiry);
      assert.deepEqual(card.cvv, data.cvv);
      assert.equal(card.wrappedKey, data.wrappedKey);
      assert.match(card.createdAt, ISO_DATE);
      assert.equal(card.updatedAt, card.createdAt);
      assert.equal(card.isOwner, true);

      const row = await knex('CARD').where({ id: data.id }).first();
      assert.deepEqual(Object.keys(row).sort(), [
        'createdAt', 'cvvCiphertext', 'cvvIv', 'expiryCiphertext', 'expiryIv', 'id', 'numberCiphertext', 'numberIv', 'updatedAt',
      ]);
      assert.equal(row.numberCiphertext, data.number.ciphertext);
    });

    it('crea exactamente una relación, la del propietario, con su clave envuelta', async () => {
      const data = await newCard();
      const card = await cards.createForOwner(adminId, data);
      const relations = await relationsOf(card.id);
      assert.equal(relations.length, 1);
      assert.equal(relations[0].userId, adminId);
      assert.equal(Boolean(relations[0].isOwner), true);
      assert.equal(relations[0].wrappedKey, data.wrappedKey);
    });

    it('rechaza un id repetido sin cambiar nada', async () => {
      const data = await newCard();
      await cards.createForOwner(adminId, data);
      const again = await newCard({ id: data.id });
      await assert.rejects(cards.createForOwner(employeeId, again), DuplicateCardError);
      assert.equal((await knex('CARD').where({ id: data.id }).first()).numberCiphertext, data.number.ciphertext);
      assert.equal((await relationsOf(data.id)).length, 1);
    });

    it('no deja la tarjeta si falla la relación', async () => {
      const before = (await knex('CARD')).length;
      await assert.rejects(cards.createForOwner(9999, await newCard()), isConstraintError);
      assert.equal((await knex('CARD')).length, before);
    });
  });

  describe('lectura a través de la relación', () => {
    it('lista solo las tarjetas del usuario, por orden de alta, con su clave envuelta', async () => {
      const first = await cards.createForOwner(adminId, await newCard());
      const second = await cards.createForOwner(adminId, await newCard());
      await cards.createForOwner(employeeId, await newCard());

      const list = await cards.listForUser(adminId);
      assert.deepEqual(list.map((card) => card.id), [first.id, second.id]);
      assert.ok(list.every((card) => card.isOwner === true));
      assert.deepEqual(list.map((card) => card.wrappedKey), [first.wrappedKey, second.wrappedKey]);
    });

    it('devuelve a cada usuario la clave envuelta de su propia relación', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await share(card.id, employeeId);
      assert.equal((await cards.findForUser(card.id, employeeId)).wrappedKey, 'w-compartida');
      assert.equal((await cards.findForUser(card.id, adminId)).wrappedKey, card.wrappedKey);
    });

    it('trata una tarjeta ajena igual que una inexistente', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      assert.equal(await cards.findForUser(card.id, employeeId), undefined);
      assert.equal(await cards.findForUser('no-existe', adminId), undefined);
      assert.equal((await cards.findForUser(card.id, adminId)).id, card.id);
    });
  });

  describe('modificación y borrado', () => {
    it('sustituye solo los valores indicados, conserva la clave envuelta y actualiza updatedAt', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      const changes = (({ expiry }) => ({ expiry }))(await newCard({ expiry: '06/2031' }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      const updated = await cards.updateForOwner(card.id, adminId, changes);

      assert.deepEqual(updated.expiry, changes.expiry);
      assert.deepEqual(updated.number, card.number);
      assert.deepEqual(updated.cvv, card.cvv);
      assert.equal(updated.wrappedKey, card.wrappedKey);
      assert.equal(updated.id, card.id);
      assert.equal(updated.createdAt, card.createdAt);
      assert.ok(updated.updatedAt > card.updatedAt);
    });

    it('no modifica ni borra si el usuario no es el propietario', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await share(card.id, employeeId);
      const stranger = (await knex('USER').insert({
        name: 'Otra', email: 'otra@empresa.com', isAdmin: false,
      }).returning('id'))[0].id;
      const changes = (({ cvv }) => ({ cvv }))(await newCard({ cvv: '999' }));

      for (const userId of [employeeId, stranger]) {
        assert.equal(await cards.updateForOwner(card.id, userId, changes), undefined);
        assert.equal(await cards.removeForOwner(card.id, userId), false);
      }
      const unchanged = await cards.findForUser(card.id, adminId);
      assert.deepEqual(unchanged.cvv, card.cvv);
      assert.equal(unchanged.updatedAt, card.updatedAt);
    });

    it('borra la tarjeta propia y todas sus relaciones', async () => {
      const card = await cards.createForOwner(adminId, await newCard());
      await share(card.id, employeeId);

      assert.equal(await cards.removeForOwner(card.id, adminId), true);
      assert.equal(await knex('CARD').where({ id: card.id }).first(), undefined);
      assert.equal((await relationsOf(card.id)).length, 0);
      assert.equal(await cards.removeForOwner(card.id, adminId), false);
    });

    it('removeOwnedBy borra las tarjetas propias y no toca las de otros', async () => {
      await cards.createForOwner(adminId, await newCard());
      await cards.createForOwner(adminId, await newCard());
      const employeeCards = await cards.listForUser(employeeId);

      assert.equal(await cards.removeOwnedBy(adminId), 2);
      assert.deepEqual(await cards.listForUser(adminId), []);
      assert.deepEqual(await cards.listForUser(employeeId), employeeCards);
    });
  });
});
