import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(serverDirectory, 'data');

mkdirSync(dataDirectory, { recursive: true });

const database = new Database(join(dataDirectory, 'app.sqlite'));

database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);

const selectNotes = database.prepare(
  'SELECT id, content, created_at AS createdAt FROM notes ORDER BY id DESC',
);
const selectNote = database.prepare(
  'SELECT id, content, created_at AS createdAt FROM notes WHERE id = ?',
);
const insertNote = database.prepare('INSERT INTO notes (content) VALUES (?)');
const removeNote = database.prepare('DELETE FROM notes WHERE id = ?');

export function getNotes() {
  return selectNotes.all();
}

export function createNote(content) {
  const result = insertNote.run(content);
  return selectNote.get(result.lastInsertRowid);
}

export function deleteNote(id) {
  return removeNote.run(id).changes > 0;
}