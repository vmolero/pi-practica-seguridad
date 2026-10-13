import { createApp } from './src/app.js';
import { createAuthService } from './src/application/auth-service.js';
import { createDatabase } from './src/infrastructure/database/knex.js';
import { createUserRepository } from './src/infrastructure/database/user-repository.js';
import { createNote, deleteNote, getNotes } from './database.js';

const port = Number(process.env.PORT) || 3000;

const knex = createDatabase();
const userRepository = createUserRepository(knex);
const authService = createAuthService({ userRepository });

const app = createApp({
  authService,
  notesStore: { getNotes, createNote, deleteNote },
});

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
