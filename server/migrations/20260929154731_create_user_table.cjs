
exports.up = function(knex) {
	return knex.schema.createTable('USER', function(table) {
		table.string('name').notNullable();
		table.string('email').notNullable();
		table.boolean('isAdmin').notNullable().defaultTo(false);
	});
};

exports.down = function(knex) {
	return knex.schema.dropTableIfExists('USER');
};
