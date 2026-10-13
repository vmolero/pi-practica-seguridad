// Retira el recurso de demostración `notes`: la tabla la creaba
// server/database.js al arrancar, fuera de las migraciones de Knex.

exports.up = async function(knex) {
	await knex.schema.dropTableIfExists('notes');
};

exports.down = async function(knex) {
	await knex.schema.createTable('notes', function(table) {
		table.increments('id').primary();
		table.text('content').notNullable();
		table.text('created_at').notNullable().defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"));
	});
};
