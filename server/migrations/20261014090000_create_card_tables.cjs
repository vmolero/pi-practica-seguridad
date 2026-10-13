// Tarjetas y su relación N:N con los usuarios (paso 4).
// La pertenencia solo se expresa en USER_CARD: en la fase 1 cada tarjeta tiene
// una única fila, la de su propietario; en la fase 2 compartir será añadir filas
// con isOwner = false.
// PROVISIONAL: número, caducidad y CVV se guardan en texto claro hasta que la
// fase 1 los sustituya por un sobre cifrado.

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

exports.up = async function(knex) {
	await knex.schema.createTable('CARD', function(table) {
		table.string('id').primary();
		table.string('number').notNullable();
		table.integer('expiryMonth').notNullable();
		table.integer('expiryYear').notNullable();
		table.string('cvv').notNullable();
		table.string('createdAt').notNullable().defaultTo(knex.raw(NOW));
		table.string('updatedAt').notNullable().defaultTo(knex.raw(NOW));
	});
	await knex.schema.createTable('USER_CARD', function(table) {
		table.integer('userId').notNullable().references('id').inTable('USER').onDelete('CASCADE');
		table.string('cardId').notNullable().references('id').inTable('CARD').onDelete('CASCADE');
		table.boolean('isOwner').notNullable().defaultTo(false);
		table.string('createdAt').notNullable().defaultTo(knex.raw(NOW));
		table.primary(['userId', 'cardId']);
		table.index(['cardId'], 'user_card_card_id');
	});
	// Un solo propietario por tarjeta. Knex no expresa índices parciales.
	await knex.raw('CREATE UNIQUE INDEX `user_card_one_owner` ON `USER_CARD` (`cardId`) WHERE `isOwner` = 1');
};

exports.down = async function(knex) {
	await knex.schema.dropTableIfExists('USER_CARD');
	await knex.schema.dropTableIfExists('CARD');
};
