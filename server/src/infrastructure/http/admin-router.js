import express, { Router } from 'express';
import { DuplicateEmailError, SelfDeletionError, UserNotFoundError } from '../../application/errors.js';
import { parseCreateUserRequest, parseRenameUserRequest, parseUserId } from './user-request.js';

export const INVALID_USER_REQUEST = 'Datos de usuario no válidos';

/**
 * Sección de administración (/api/private/admin). Se monta dentro de la
 * sección privada, así que la autenticación ya está hecha; aquí se exige
 * además el rol de administrador.
 */
export function createAdminRouter({ userAdminService, requireAdmin }) {
  const router = Router();

  router.use(requireAdmin);
  router.use(express.json());

  router.get('/users', async (_request, response) => {
    response.json({ users: await userAdminService.list() });
  });

  router.post('/users', async (request, response) => {
    const data = parseCreateUserRequest(request.body);
    if (!data) return response.status(400).json({ error: INVALID_USER_REQUEST });

    return response.status(201).json(await userAdminService.create(data));
  });

  router.patch('/users/:id', async (request, response) => {
    const id = parseUserId(request.params.id);
    if (id === null) throw new UserNotFoundError();

    const data = parseRenameUserRequest(request.body);
    if (!data) return response.status(400).json({ error: INVALID_USER_REQUEST });

    return response.json(await userAdminService.rename(id, data.name));
  });

  router.delete('/users/:id', async (request, response) => {
    const id = parseUserId(request.params.id);
    if (id === null) throw new UserNotFoundError();

    await userAdminService.remove(id, { actingUserId: request.user.id });
    return response.status(204).end();
  });

  // Traduce los errores de aplicación y el JSON ilegible a su respuesta.
  router.use((error, _request, response, next) => {
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: INVALID_USER_REQUEST });
    }
    if (error instanceof UserNotFoundError) return response.status(404).json({ error: error.message });
    if (error instanceof DuplicateEmailError) return response.status(409).json({ error: error.message });
    if (error instanceof SelfDeletionError) return response.status(400).json({ error: error.message });
    return next(error);
  });

  return router;
}
