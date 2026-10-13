import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createCardService } from '../src/application/card-service.js';
import { CardForbiddenError, CardNotFoundError } from '../src/application/errors.js';

const OWN_ID = 'b6f1c2de-0000-4000-8000-000000000001';
const SHARED_ID = 'b6f1c2de-0000-4000-8000-000000000002';
const CARD_DATA = { number: '4111111111111111', expiryMonth: 12, expiryYear: 2030, cvv: '123' };

// Usuario 1: propietario de OWN_ID y relacionado sin propiedad con SHARED_ID.
function createInMemoryCardRepository() {
  const cards = new Map([
    [OWN_ID, { id: OWN_ID, ...CARD_DATA, createdAt: 'c1', updatedAt: 'c1' }],
    [SHARED_ID, { id: SHARED_ID, ...CARD_DATA, number: '5555555555554444', createdAt: 'c2', updatedAt: 'c2' }],
  ]);
  const relations = [
    { userId: 1, cardId: OWN_ID, isOwner: true },
    { userId: 2, cardId: SHARED_ID, isOwner: true },
    { userId: 1, cardId: SHARED_ID, isOwner: false },
  ];
  const calls = { createForOwner: [], updateForOwner: 0, removeForOwner: 0 };
  const view = (relation) => ({ ...cards.get(relation.cardId), isOwner: relation.isOwner });

  return {
    calls,
    // Simula que la tarjeta se borra entre la comprobación y la escritura.
    vanishOnWrite: false,
    async listForUser(userId) {
      return relations.filter((relation) => relation.userId === userId && cards.has(relation.cardId)).map(view);
    },
    async findForUser(cardId, userId) {
      const relation = relations.find((candidate) => candidate.userId === userId && candidate.cardId === cardId);
      return relation && cards.has(cardId) ? view(relation) : undefined;
    },
    async createForOwner(ownerId, data) {
      calls.createForOwner.push(ownerId);
      const card = { id: 'nueva', ...data, createdAt: 'c3', updatedAt: 'c3' };
      cards.set(card.id, card);
      relations.push({ userId: ownerId, cardId: card.id, isOwner: true });
      return { ...card, isOwner: true };
    },
    async updateForOwner(cardId, ownerId, changes) {
      calls.updateForOwner += 1;
      if (this.vanishOnWrite) return undefined;
      Object.assign(cards.get(cardId), changes);
      return this.findForUser(cardId, ownerId);
    },
    async removeForOwner(cardId) {
      calls.removeForOwner += 1;
      if (this.vanishOnWrite) return false;
      return cards.delete(cardId);
    },
  };
}

const MASKED_KEYS = ['createdAt', 'expiryMonth', 'expiryYear', 'id', 'last4'];

describe('cardService', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createInMemoryCardRepository();
    service = createCardService({ cardRepository: repository });
  });

  it('lista las tarjetas enmascaradas, sin número completo ni CVV', async () => {
    const list = await service.list(1);
    assert.equal(list.length, 2);
    for (const card of list) assert.deepEqual(Object.keys(card).sort(), MASKED_KEYS);
    assert.equal(list[0].last4, '1111');
  });

  it('da de alta la tarjeta para el usuario indicado y la devuelve enmascarada', async () => {
    const created = await service.create(7, CARD_DATA);
    assert.deepEqual(repository.calls.createForOwner, [7]);
    assert.deepEqual(Object.keys(created).sort(), MASKED_KEYS);
  });

  it('modifica una tarjeta propia y la devuelve enmascarada', async () => {
    const updated = await service.update(1, OWN_ID, { number: '5555555555554444' });
    assert.equal(updated.last4, '4444');
    assert.deepEqual(Object.keys(updated).sort(), MASKED_KEYS);
  });

  it('borra una tarjeta propia', async () => {
    await service.remove(1, OWN_ID);
    assert.equal(await repository.findForUser(OWN_ID, 1), undefined);
  });

  it('trata una tarjeta sin relación como inexistente', async () => {
    await assert.rejects(service.update(3, OWN_ID, { cvv: '999' }), CardNotFoundError);
    await assert.rejects(service.remove(3, OWN_ID), CardNotFoundError);
    await assert.rejects(service.remove(1, 'no-existe'), CardNotFoundError);
  });

  it('rechaza modificar o borrar sin ser propietario, sin llegar a escribir', async () => {
    await assert.rejects(service.update(1, SHARED_ID, { cvv: '999' }), CardForbiddenError);
    await assert.rejects(service.remove(1, SHARED_ID), CardForbiddenError);
    assert.equal(repository.calls.updateForOwner, 0);
    assert.equal(repository.calls.removeForOwner, 0);
  });

  it('responde no encontrada si la tarjeta desaparece antes de escribir', async () => {
    repository.vanishOnWrite = true;
    await assert.rejects(service.update(1, OWN_ID, { cvv: '999' }), CardNotFoundError);
    await assert.rejects(service.remove(1, OWN_ID), CardNotFoundError);
  });
});
