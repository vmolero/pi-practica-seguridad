import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createCardRepository } from '../src/infrastructure/database/card-repository.js';
import { createTestDatabase } from './helpers.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CARD_DATA = { number: '5555555555554444', expiryMonth: 3, expiryYear: 2030, cvv: '012' };

const isConstraintError = (error) => String(error.code).startsWith('SQLITE_CONSTRAINT');

describe('cardRepository', () => {
  let database;
  let knex;
  let cards;
  let employeeId;
  let adminId;

  beforeEach(async () => {
    database = await createTestDatabase();
    knex = database.knex;
    cards = createCardRepository(knex);
    employeeId = (await knex('USER').where({ email: 'empleado@empresa.com' }).first()).id;
    adminId = (await knex('USER').where({ email: 'admin@empresa.com' }).first()).id;
  });

  afterEach(() => database.cleanup());

  const relationsOf = (cardId) => knex('USER_CARD').where({ cardId });

  describe('esquema', () => {
    it('rechaza una pareja (userId, cardId) repetida', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await assert.rejects(
        knex('USER_CARD').insert({ userId: adminId, cardId: card.id, isOwner: false }),
        isConstraintError,
      );
    });

    it('rechaza una relación con un usuario inexistente', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await assert.rejects(
        knex('USER_CARD').insert({ userId: 9999, cardId: card.id, isOwner: false }),
        isConstraintError,
      );
    });

    it('rechaza un segundo propietario', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await assert.rejects(
        knex('USER_CARD').insert({ userId: employeeId, cardId: card.id, isOwner: true }),
        isConstraintError,
      );
    });

    it('acepta una relación sin propiedad, preparada para compartir', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await knex('USER_CARD').insert({ userId: employeeId, cardId: card.id, isOwner: false });
      assert.equal((await relationsOf(card.id)).length, 2);
    });
  });

  describe('alta', () => {
    it('conserva los ceros a la izquierda, genera un UUID v4 y fija las fechas', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      assert.equal(card.cvv, '012');
      assert.match(card.id, UUID_V4);
      assert.match(card.createdAt, ISO_DATE);
      assert.equal(card.updatedAt, card.createdAt);
      assert.equal(card.isOwner, true);
    });

    it('crea exactamente una relación, la del propietario', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      const relations = await relationsOf(card.id);
      assert.equal(relations.length, 1);
      assert.equal(relations[0].userId, adminId);
      assert.equal(Boolean(relations[0].isOwner), true);
    });

    it('no deja la tarjeta si falla la relación', async () => {
      const before = (await knex('CARD')).length;
      await assert.rejects(cards.createForOwner(9999, CARD_DATA), isConstraintError);
      assert.equal((await knex('CARD')).length, before);
    });
  });

  describe('lectura a través de la relación', () => {
    it('lista solo las tarjetas del usuario, por orden de alta', async () => {
      const first = await cards.createForOwner(adminId, CARD_DATA);
      const second = await cards.createForOwner(adminId, { ...CARD_DATA, number: '4111111111111111' });
      await cards.createForOwner(employeeId, CARD_DATA);

      const list = await cards.listForUser(adminId);
      assert.deepEqual(list.map((card) => card.id), [first.id, second.id]);
      assert.ok(list.every((card) => card.isOwner === true));
    });

    it('trata una tarjeta ajena igual que una inexistente', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      assert.equal(await cards.findForUser(card.id, employeeId), undefined);
      assert.equal(await cards.findForUser('no-existe', adminId), undefined);
      assert.equal((await cards.findForUser(card.id, adminId)).id, card.id);
    });
  });

  describe('modificación y borrado', () => {
    it('modifica solo los campos indicados y actualiza updatedAt', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const updated = await cards.updateForOwner(card.id, adminId, { expiryMonth: 6, expiryYear: 2031 });

      assert.equal(updated.expiryMonth, 6);
      assert.equal(updated.expiryYear, 2031);
      assert.equal(updated.number, card.number);
      assert.equal(updated.cvv, card.cvv);
      assert.equal(updated.id, card.id);
      assert.equal(updated.createdAt, card.createdAt);
      assert.ok(updated.updatedAt > card.updatedAt);
    });

    it('no modifica ni borra si el usuario no es el propietario', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await knex('USER_CARD').insert({ userId: employeeId, cardId: card.id, isOwner: false });
      const stranger = (await knex('USER').insert({
        name: 'Otra', email: 'otra@empresa.com', password: 'inicial123', isAdmin: false,
      }).returning('id'))[0].id;

      for (const userId of [employeeId, stranger]) {
        assert.equal(await cards.updateForOwner(card.id, userId, { cvv: '999' }), undefined);
        assert.equal(await cards.removeForOwner(card.id, userId), false);
      }
      const unchanged = await cards.findForUser(card.id, adminId);
      assert.equal(unchanged.cvv, '012');
      assert.equal(unchanged.updatedAt, card.updatedAt);
    });

    it('borra la tarjeta propia y todas sus relaciones', async () => {
      const card = await cards.createForOwner(adminId, CARD_DATA);
      await knex('USER_CARD').insert({ userId: employeeId, cardId: card.id, isOwner: false });

      assert.equal(await cards.removeForOwner(card.id, adminId), true);
      assert.equal(await knex('CARD').where({ id: card.id }).first(), undefined);
      assert.equal((await relationsOf(card.id)).length, 0);
      assert.equal(await cards.removeForOwner(card.id, adminId), false);
    });

    it('removeOwnedBy borra las tarjetas propias y no toca las de otros', async () => {
      await cards.createForOwner(adminId, CARD_DATA);
      await cards.createForOwner(adminId, CARD_DATA);
      const employeeCards = await cards.listForUser(employeeId);

      assert.equal(await cards.removeOwnedBy(adminId), 2);
      assert.deepEqual(await cards.listForUser(adminId), []);
      assert.deepEqual(await cards.listForUser(employeeId), employeeCards);
    });
  });
});
