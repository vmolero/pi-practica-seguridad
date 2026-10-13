import { toMaskedCard } from '../domain/card.js';
import { CardForbiddenError, CardNotFoundError } from './errors.js';

/**
 * Servicio de tarjetas del propio usuario (dashboard).
 * Recibe un repositorio con listForUser, findForUser, createForOwner,
 * updateForOwner y removeForOwner. Todo lo que devuelve pasa por
 * toMaskedCard: nunca el número completo ni el CVV.
 * PROVISIONAL (paso 5): los datos llegan y se guardan en texto claro; la
 * fase 1 los cifrará en el navegador.
 */
export function createCardService({ cardRepository }) {
  // Tarjeta que el usuario puede modificar o borrar: tiene que verla
  // (relación en USER_CARD) y ser su propietario.
  async function findOwned(userId, cardId) {
    const card = await cardRepository.findForUser(cardId, userId);
    if (!card) throw new CardNotFoundError();
    if (!card.isOwner) throw new CardForbiddenError();
    return card;
  }

  return {
    async list(userId) {
      return (await cardRepository.listForUser(userId)).map(toMaskedCard);
    },

    /**
     * Da de alta una tarjeta con el usuario como único propietario.
     */
    async create(userId, data) {
      return toMaskedCard(await cardRepository.createForOwner(userId, data));
    },

    /**
     * Modifica solo los campos de `changes` y devuelve la tarjeta actualizada.
     */
    async update(userId, cardId, changes) {
      await findOwned(userId, cardId);
      const updated = await cardRepository.updateForOwner(cardId, userId, changes);
      // Borrada entre la comprobación y la escritura.
      if (!updated) throw new CardNotFoundError();
      return toMaskedCard(updated);
    },

    async remove(userId, cardId) {
      await findOwned(userId, cardId);
      if (!(await cardRepository.removeForOwner(cardId, userId))) throw new CardNotFoundError();
    },
  };
}
