import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createCardService } from '../src/application/card-service.js';
import { CardConflictError, CardForbiddenError, CardNotFoundError } from '../src/application/errors.js';
import { DuplicateCardError } from '../src/infrastructure/database/card-repository.js';

const OWN_ID = 'b6f1c2de-0000-4000-8000-000000000001';
const SHARED_ID = 'b6f1c2de-0000-4000-8000-000000000002';
const NEW_ID = 'b6f1c2de-0000-4000-8000-000000000003';
const value = (tag) => ({ iv: `iv-${tag}`, ciphertext: `c-${tag}` });
const CARD_DATA = { number: value('num'), expiry: value('exp'), cvv: value('cvv') };

// Usuario 1: propietario de OWN_ID y relacionado sin propiedad con SHARED_ID.
function createInMemoryCardRepository() {
  const cards = new Map([
    [OWN_ID, { id: OWN_ID, ...CARD_DATA, createdAt: 'c1', updatedAt: 'c1' }],
    [SHARED_ID, { id: SHARED_ID, ...CARD_DATA, number: value('num2'), createdAt: 'c2', updatedAt: 'c2' }],
  ]);
  const relations = [
    { userId: 1, cardId: OWN_ID, isOwner: true, wrappedKey: 'w-1' },
    { userId: 2, cardId: SHARED_ID, isOwner: true, wrappedKey: 'w-2' },
    { userId: 1, cardId: SHARED_ID, isOwner: false, wrappedKey: 'w-1-shared' },
  ];
  const calls = { createForOwner: [], updateForOwner: 0, removeForOwner: 0 };
  const view = (relation) => ({ ...cards.get(relation.cardId), isOwner: relation.isOwner, wrappedKey: relation.wrappedKey });

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
    async createForOwner(ownerId, { id, wrappedKey, ...values }) {
      calls.createForOwner.push(ownerId);
      if (cards.has(id)) throw new DuplicateCardError();
      const card = { id, ...values, createdAt: 'c3', updatedAt: 'c3' };
      cards.set(card.id, card);
      relations.push({ userId: ownerId, cardId: card.id, isOwner: true, wrappedKey });
      return { ...card, isOwner: true, wrappedKey };
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

const ENCRYPTED_KEYS = ['createdAt', 'cvv', 'expiry', 'id', 'number', 'wrappedKey'];

describe('cardService', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createInMemoryCardRepository();
    service = createCardService({ cardRepository: repository });
  });

  it('lista las tarjetas cifradas con la clave envuelta del usuario', async () => {
    const list = await service.list(1);
    assert.equal(list.length, 2);
    for (const card of list) assert.deepEqual(Object.keys(card).sort(), ENCRYPTED_KEYS);
    assert.deepEqual(list[0].number, value('num'));
    assert.equal(list[0].wrappedKey, 'w-1');
    assert.equal(list[1].wrappedKey, 'w-1-shared');
  });

  it('da de alta la tarjeta con su id para el usuario indicado y la devuelve cifrada', async () => {
    const created = await service.create(7, { id: NEW_ID, ...CARD_DATA, wrappedKey: 'w-7' });
    assert.deepEqual(repository.calls.createForOwner, [7]);
    assert.deepEqual(Object.keys(created).sort(), ENCRYPTED_KEYS);
    assert.equal(created.id, NEW_ID);
    assert.equal(created.wrappedKey, 'w-7');
  });

  it('responde con conflicto si el id ya existe', async () => {
    await assert.rejects(service.create(7, { id: OWN_ID, ...CARD_DATA, wrappedKey: 'w-7' }), CardConflictError);
  });

  it('modifica una tarjeta propia y la devuelve cifrada', async () => {
    const updated = await service.update(1, OWN_ID, { expiry: value('exp-nuevo') });
    assert.deepEqual(updated.expiry, value('exp-nuevo'));
    assert.deepEqual(updated.number, value('num'));
    assert.deepEqual(Object.keys(updated).sort(), ENCRYPTED_KEYS);
  });

  it('borra una tarjeta propia', async () => {
    await service.remove(1, OWN_ID);
    assert.equal(await repository.findForUser(OWN_ID, 1), undefined);
  });

  it('trata una tarjeta sin relación como inexistente', async () => {
    await assert.rejects(service.update(3, OWN_ID, { cvv: value('x') }), CardNotFoundError);
    await assert.rejects(service.remove(3, OWN_ID), CardNotFoundError);
    await assert.rejects(service.remove(1, 'no-existe'), CardNotFoundError);
  });

  it('rechaza modificar o borrar sin ser propietario, sin llegar a escribir', async () => {
    await assert.rejects(service.update(1, SHARED_ID, { cvv: value('x') }), CardForbiddenError);
    await assert.rejects(service.remove(1, SHARED_ID), CardForbiddenError);
    assert.equal(repository.calls.updateForOwner, 0);
    assert.equal(repository.calls.removeForOwner, 0);
  });

  it('responde no encontrada si la tarjeta desaparece antes de escribir', async () => {
    repository.vanishOnWrite = true;
    await assert.rejects(service.update(1, OWN_ID, { cvv: value('x') }), CardNotFoundError);
    await assert.rejects(service.remove(1, OWN_ID), CardNotFoundError);
  });
});
