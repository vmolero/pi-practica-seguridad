import express from 'express';
import { createPublicRouter } from './infrastructure/http/public-router.js';

/**
 * Crea la aplicación Express con sus dependencias ya construidas.
 */
export function createApp({ authService }) {
  const app = express();

  app.disable('x-powered-by');

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', message: 'Connected to the server' });
  });

  app.use('/api/public', createPublicRouter({ authService }));

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
