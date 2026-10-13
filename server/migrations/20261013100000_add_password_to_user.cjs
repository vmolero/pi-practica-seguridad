// SQLite no permite añadir una clave primaria a una tabla existente, así que se
// recrea la tabla USER copiando las filas que tuviera.
// PROVISIONAL: la contraseña se guarda en texto claro (paso 1, sin seguridad).

exports.up = async function(knex) {
	await knex.schema.createTable('USER_new', function(table) {
		table.increments('id').primary();
		table.string('name').notNullable();
		table.string('email').notNullable().unique({ indexName: 'user_email_unique' });
		table.string('password').notNullable();
		table.boolean('isAdmin').notNullable().defaultTo(false);
	});
	// Las filas existentes quedan con contraseña vacía, que nunca supera la
	// validación de la petición de login.
	await knex.raw(
		"INSERT INTO `USER_new` (name, email, password, isAdmin) SELECT name, lower(trim(email)), '', isAdmin FROM `USER`",
	);
	await knex.schema.dropTable('USER');
	await knex.schema.renameTable('USER_new', 'USER');
};

exports.down = async function(knex) {
	await knex.schema.createTable('USER_old', function(table) {
		table.string('name').notNullable();
		table.string('email').notNullable();
		table.boolean('isAdmin').notNullable().defaultTo(false);
	});
	await knex.raw('INSERT INTO `USER_old` (name, email, isAdmin) SELECT name, email, isAdmin FROM `USER`');
	await knex.schema.dropTable('USER');
	await knex.schema.renameTable('USER_old', 'USER');
};
