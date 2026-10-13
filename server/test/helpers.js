import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../src/infrastructure/database/knex.js';

/**
 * Crea una base de datos SQLite temporal con las migraciones y el seed aplicados.
 * Devuelve { knex, cleanup }.
 */
export async function createTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'tarjetas-test-'));
  const knex = createDatabase({ filename: join(directory, 'test.sqlite') });
  await knex.migrate.latest();
  await knex.seed.run();

  return {
    knex,
    async cleanup() {
      await knex.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
