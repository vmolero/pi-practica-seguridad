import { Router } from 'express';
import { toPublicUser } from '../../domain/user.js';

/**
 * Sección privada de la API (/api/private): todo pasa por el middleware de
 * autenticación, incluidas las rutas que no existen.
 */
export function createPrivateRouter({ authMiddleware }) {
  const router = Router();

  router.use(authMiddleware);

  router.get('/me', (request, response) => {
    response.json(toPublicUser(request.user));
  });

  return router;
}
