import createKnex from 'knex';
import knexfile from '../../../knexfile.cjs';

/**
 * Crea una conexión de Knex con la configuración de knexfile.cjs.
 * `filename` permite usar otra base de datos (por ejemplo, una temporal en los tests).
 */
export function createDatabase({ filename } = {}) {
  const config = knexfile.development;
  return createKnex({
    ...config,
    connection: filename ? { filename } : config.connection,
  });
}
