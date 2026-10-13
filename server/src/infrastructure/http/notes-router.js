import express, { Router } from 'express';

/**
 * Recurso de notas de demostración. Se retirará en un paso posterior.
 * `notesStore` expone getNotes(), createNote(content) y deleteNote(id).
 */
export function createNotesRouter({ notesStore }) {
  const router = Router();

  router.use(express.json());

  router.get('/', (_request, response) => {
    response.json(notesStore.getNotes());
  });

  router.post('/', (request, response) => {
    const content = request.body?.content;

    if (typeof content !== 'string' || !content.trim() || content.trim().length > 1000) {
      return response.status(400).json({ error: 'Content must be a non-empty string of at most 1000 characters' });
    }

    return response.status(201).json(notesStore.createNote(content.trim()));
  });

  router.delete('/:id', (request, response) => {
    const id = Number(request.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return response.status(400).json({ error: 'Note ID must be a positive integer' });
    }

    if (!notesStore.deleteNote(id)) {
      return response.status(404).json({ error: 'Note not found' });
    }

    return response.sendStatus(204);
  });

  return router;
}
