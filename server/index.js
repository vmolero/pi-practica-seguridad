import express from 'express';
import { createNote, deleteNote, getNotes } from './database.js';

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', message: 'Connected to the server' });
});

app.get('/api/notes', (_request, response) => {
  response.json(getNotes());
});

app.post('/api/notes', (request, response) => {
  const content = request.body?.content;

  if (typeof content !== 'string' || !content.trim() || content.trim().length > 1000) {
    return response.status(400).json({ error: 'Content must be a non-empty string of at most 1000 characters' });
  }

  return response.status(201).json(createNote(content.trim()));
});

app.delete('/api/notes/:id', (request, response) => {
  const id = Number(request.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return response.status(400).json({ error: 'Note ID must be a positive integer' });
  }

  if (!deleteNote(id)) {
    return response.status(404).json({ error: 'Note not found' });
  }

  return response.sendStatus(204);
});

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});