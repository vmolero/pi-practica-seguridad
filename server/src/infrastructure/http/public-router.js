import express, { Router } from 'express';
import { InvalidCredentialsError } from '../../application/errors.js';
import { parseLoginRequest } from './login-request.js';

export const INVALID_LOGIN_REQUEST = 'Petición de login no válida';

/**
 * Sección pública de la API (/api/public): endpoints que no requieren sesión.
 */
export function createPublicRouter({ authService }) {
  const router = Router();

  router.use(express.json());

  router.post('/login', async (request, response) => {
    const credentials = parseLoginRequest(request.body);
    if (!credentials) {
      return response.status(400).json({ error: INVALID_LOGIN_REQUEST });
    }

    try {
      const user = await authService.login(credentials);
      return response.json(user);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return response.status(401).json({ error: error.message });
      }
      throw error;
    }
  });

  // JSON ilegible en el cuerpo: se trata como una petición no válida.
  router.use((error, _request, response, next) => {
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: INVALID_LOGIN_REQUEST });
    }
    return next(error);
  });

  return router;
}
