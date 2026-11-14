import { ENCRYPTED_FIELDS, columnsOf, toCard } from '../../domain/card.js';

const CARD_COLUMNS = [
  'CARD.id',
  ...ENCRYPTED_FIELDS.flatMap((field) => Object.values(columnsOf(field))),
  'isOwner',
  'wrappedKey',
  'CARD.createdAt',
  'updatedAt',
];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** La tarjeta ya existe (el id lo genera el cliente). */
export class DuplicateCardError extends Error {
  constructor() {
    super('La tarjeta ya existe');
    this.name = 'DuplicateCardError';
  }
}

const isPrimaryKeyViolation = (error) => String(error.code) === 'SQLITE_CONSTRAINT_PRIMARYKEY';

// Columnas de CARD a partir de { number?, expiry?, cvv? } como { iv, ciphertext }.
function toColumns(values) {
  const data = {};
  for (const field of ENCRYPTED_FIELDS) {
    if (values[field] === undefined) continue;
    const columns = columnsOf(field);
    data[columns.iv] = values[field].iv;
    data[columns.ciphertext] = values[field].ciphertext;
  }
  return data;
}

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
 * Los valores llegan y salen cifrados; la clave envuelta de cada usuario
 * está en su fila de USER_CARD.
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
     * Crea la tarjeta con el id del cliente y su única relación, la del
     * propietario con su clave envuelta, en una misma transacción. Devuelve
     * la tarjeta creada; lanza DuplicateCardError si el id ya existe.
     */
    async createForOwner(ownerId, { id, wrappedKey, ...values }) {
      try {
        return await knex.transaction(async (trx) => {
          await trx('CARD').insert({ id, ...toColumns(values) });
          await trx('USER_CARD').insert({ userId: ownerId, cardId: id, isOwner: true, wrappedKey });
          return findForUser(id, ownerId, trx);
        });
      } catch (error) {
        if (isPrimaryKeyViolation(error)) throw new DuplicateCardError();
        throw error;
      }
    },

    /**
     * Sustituye los valores cifrados presentes en `changes` y la fecha de
     * modificación, solo si `ownerId` es el propietario. La clave envuelta no
     * cambia. Devuelve la tarjeta actualizada o undefined.
     */
    async updateForOwner(cardId, ownerId, changes) {
      const updated = await knex('CARD')
        .where('id', cardId)
        .whereIn('id', ownedCardIds(knex, ownerId))
        .update({ ...toColumns(changes), updatedAt: knex.raw(NOW) });
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
