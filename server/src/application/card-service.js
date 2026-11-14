import { toEncryptedCard } from '../domain/card.js';
import { DuplicateCardError } from '../infrastructure/database/card-repository.js';
import { CardConflictError, CardForbiddenError, CardNotFoundError } from './errors.js';

/**
 * Servicio de tarjetas del propio usuario (dashboard).
 * Recibe un repositorio con listForUser, findForUser, createForOwner,
 * updateForOwner y removeForOwner. Los valores llegan y salen cifrados por
 * el navegador (paso 10): el servicio no puede leerlos y todo lo que
 * devuelve pasa por toEncryptedCard.
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
      return (await cardRepository.listForUser(userId)).map(toEncryptedCard);
    },

    /**
     * Da de alta una tarjeta, con el id que trae, con el usuario como único
     * propietario. Lanza CardConflictError si el id ya existe.
     */
    async create(userId, data) {
      try {
        return toEncryptedCard(await cardRepository.createForOwner(userId, data));
      } catch (error) {
        if (error instanceof DuplicateCardError) throw new CardConflictError();
        throw error;
      }
    },

    /**
     * Sustituye solo los valores de `changes` y devuelve la tarjeta actualizada.
     */
    async update(userId, cardId, changes) {
      await findOwned(userId, cardId);
      const updated = await cardRepository.updateForOwner(cardId, userId, changes);
      // Borrada entre la comprobación y la escritura.
      if (!updated) throw new CardNotFoundError();
      return toEncryptedCard(updated);
    },

    async remove(userId, cardId) {
      await findOwned(userId, cardId);
      if (!(await cardRepository.removeForOwner(cardId, userId))) throw new CardNotFoundError();
    },
  };
}
