// Paso 8: la contraseña deja de guardarse. En su lugar, USER guarda la sal y
// el hash lento de la clave de login K_L (ver docs/diagrama-secuencia-login.md).
// Los usuarios anteriores quedan con NULL y no pueden iniciar sesión: en
// desarrollo se vuelve a sembrar.

exports.up = async function(knex) {
  await knex.schema.alterTable('USER', function(table) {
    table.dropColumn('password');
    table.text('loginKeySalt').nullable();
    table.text('loginKeyHash').nullable();
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('USER', function(table) {
    table.dropColumn('loginKeySalt');
    table.dropColumn('loginKeyHash');
    // Las filas existentes ya no tienen contraseña: vacía por defecto.
    table.text('password').notNullable().defaultTo('');
  });
};
