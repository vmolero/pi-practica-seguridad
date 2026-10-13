import express, { Router } from 'express';
import { CardForbiddenError, CardNotFoundError } from '../../application/errors.js';
import { parseCardId, parseCreateCardRequest, parseUpdateCardRequest } from './card-request.js';

export const INVALID_CARD_REQUEST = 'Datos de tarjeta no válidos';

/**
 * Tarjetas del propio usuario (/api/private/cards). Se monta dentro de la
 * sección privada, así que la autenticación ya está hecha. El usuario sale
 * siempre del token, nunca del cuerpo ni de la URL.
 */
export function createCardsRouter({ cardService }) {
  const router = Router();

  router.use(express.json());

  router.get('/', async (request, response) => {
    response.json({ cards: await cardService.list(request.user.id) });
  });

  router.post('/', async (request, response) => {
    const data = parseCreateCardRequest(request.body);
    if (!data) return response.status(400).json({ error: INVALID_CARD_REQUEST });

    return response.status(201).json(await cardService.create(request.user.id, data));
  });

  router.patch('/:id', async (request, response) => {
    const id = parseCardId(request.params.id);
    if (id === null) throw new CardNotFoundError();

    const changes = parseUpdateCardRequest(request.body);
    if (!changes) return response.status(400).json({ error: INVALID_CARD_REQUEST });

    return response.json(await cardService.update(request.user.id, id, changes));
  });

  router.delete('/:id', async (request, response) => {
    const id = parseCardId(request.params.id);
    if (id === null) throw new CardNotFoundError();

    await cardService.remove(request.user.id, id);
    return response.status(204).end();
  });

  // Traduce los errores de aplicación y el JSON ilegible a su respuesta.
  router.use((error, _request, response, next) => {
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: INVALID_CARD_REQUEST });
    }
    if (error instanceof CardNotFoundError) return response.status(404).json({ error: error.message });
    if (error instanceof CardForbiddenError) return response.status(403).json({ error: error.message });
    return next(error);
  });

  return router;
}
