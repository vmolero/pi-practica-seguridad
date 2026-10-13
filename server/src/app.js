import express from 'express';
import { createAuthMiddleware } from './infrastructure/http/auth-middleware.js';
import { createPrivateRouter } from './infrastructure/http/private-router.js';
import { createPublicRouter } from './infrastructure/http/public-router.js';

/**
 * Crea la aplicación Express con sus dependencias ya construidas.
 */
export function createApp({ authService, tokenService }) {
  const app = express();

  app.disable('x-powered-by');

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', message: 'Connected to the server' });
  });

  app.use('/api/public', createPublicRouter({ authService }));
  app.use('/api/private', createPrivateRouter({
    authMiddleware: createAuthMiddleware({ tokenService }),
  }));

  // Cualquier error que ningún router haya tratado.
  // eslint-disable-next-line no-unused-vars
  app.use((error, _request, response, _next) => {
    if (error.status >= 400 && error.status < 500) {
      return response.status(error.status).json({ error: 'Petición no válida' });
    }

    console.error(error);
    return response.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
