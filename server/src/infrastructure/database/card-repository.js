import { randomUUID } from 'node:crypto';
import { toCard } from '../../domain/card.js';

const CARD_COLUMNS = ['CARD.id', 'number', 'expiryMonth', 'expiryYear', 'cvv', 'isOwner', 'CARD.createdAt', 'updatedAt'];
const DATA_FIELDS = ['number', 'expiryMonth', 'expiryYear', 'cvv'];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// Identificadores de las tarjetas de las que `userId` es propietario.
function ownedCardIds(db, userId) {
  return db('USER_CARD').select('cardId').where({ userId, isOwner: true });
}

/**
 * Borra las tarjetas de las que `userId` es propietario; la cascada elimina
 * sus filas de USER_CARD. `db` puede ser una transacción.
 */
export function deleteCardsOwnedBy(db, userId) {
  return db('CARD').whereIn('id', ownedCardIds(db, userId)).del();
}

/**
 * Repositorio de tarjetas sobre CARD y USER_CARD.
 * Toda lectura parte de un usuario y pasa por USER_CARD, y toda escritura
 * exige que el usuario sea el propietario: una tarjeta ajena se trata igual
 * que una inexistente. No hay ninguna operación para relacionar una tarjeta
 * existente con otro usuario (fase 1: un único usuario por tarjeta).
 * PROVISIONAL: los datos se guardan en texto claro hasta la fase 1.
 */
export function createCardRepository(knex) {
  function cardsOf(db, userId) {
    return db('CARD')
      .join('USER_CARD', 'USER_CARD.cardId', 'CARD.id')
      .select(CARD_COLUMNS)
      .where('USER_CARD.userId', userId);
  }

  async function findForUser(cardId, userId, db = knex) {
    const row = await cardsOf(db, userId).andWhere('CARD.id', cardId).first();
    return row && toCard(row);
  }

  return {
    findForUser,

    /**
     * Tarjetas relacionadas con el usuario, por orden de alta.
     */
    async listForUser(userId) {
      const rows = await cardsOf(knex, userId).orderBy([
        { column: 'CARD.createdAt' },
        { column: 'CARD.rowid' },
      ]);
      return rows.map(toCard);
    },

    /**
     * Crea la tarjeta y su única relación, la del propietario, en una misma
     * transacción. Devuelve la tarjeta creada.
     */
    async createForOwner(ownerId, { number, expiryMonth, expiryYear, cvv }) {
      const id = randomUUID();
      return knex.transaction(async (trx) => {
        await trx('CARD').insert({ id, number, expiryMonth, expiryYear, cvv });
        await trx('USER_CARD').insert({ userId: ownerId, cardId: id, isOwner: true });
        return findForUser(id, ownerId, trx);
      });
    },

    /**
     * Actualiza los campos presentes en `changes` y la fecha de modificación,
     * solo si `ownerId` es el propietario. Devuelve la tarjeta actualizada o
     * undefined.
     */
    async updateForOwner(cardId, ownerId, changes) {
      const data = Object.fromEntries(
        DATA_FIELDS.filter((field) => changes[field] !== undefined).map((field) => [field, changes[field]]),
      );
      const updated = await knex('CARD')
        .where('id', cardId)
        .whereIn('id', ownedCardIds(knex, ownerId))
        .update({ ...data, updatedAt: knex.raw(NOW) });
      return updated > 0 ? findForUser(cardId, ownerId) : undefined;
    },

    /**
     * Borra la tarjeta si `ownerId` es su propietario. Devuelve si había fila.
     */
    async removeForOwner(cardId, ownerId) {
      return (await knex('CARD').where('id', cardId).whereIn('id', ownedCardIds(knex, ownerId)).del()) > 0;
    },

    /**
     * Borra todas las tarjetas de las que `userId` es propietario.
     */
    async removeOwnedBy(userId, trx = knex) {
      return deleteCardsOwnedBy(trx, userId);
    },
  };
}
