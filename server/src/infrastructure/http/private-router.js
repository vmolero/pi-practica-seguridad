import { Router } from 'express';
import { toPublicUser } from '../../domain/user.js';
import { createAdminRouter } from './admin-router.js';
import { createCardsRouter } from './cards-router.js';
import { createRequireAdmin } from './require-admin.js';

/**
 * Sección privada de la API (/api/private): todo pasa por el middleware de
 * autenticación, incluidas las rutas que no existen.
 */
export function createPrivateRouter({ authMiddleware, userAdminService, userRepository, cardService }) {
  const router = Router();

  router.use(authMiddleware);

  router.get('/me', (request, response) => {
    response.json(toPublicUser(request.user));
  });

  router.use('/cards', createCardsRouter({ cardService }));

  router.use('/admin', createAdminRouter({
    userAdminService,
    requireAdmin: createRequireAdmin({ userRepository }),
  }));

  return router;
}
