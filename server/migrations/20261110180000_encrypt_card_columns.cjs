// Tarjetas cifradas de extremo a extremo (paso 10).
// CARD deja de guardar number, expiryMonth, expiryYear y cvv en claro y pasa a
// guardar, por valor, el vector de inicialización y el texto cifrado con
// AES-256-GCM bajo la clave de la tarjeta K_t (base64). USER_CARD guarda en
// cada relación esa clave envuelta con la clave pública del usuario (w_U).
//
// La migración vacía USER_CARD y CARD: los datos en claro no se pueden cifrar
// sin la contraseña del usuario, y las únicas tarjetas existentes son las de
// la semilla, que se vuelven a crear cifradas con `npm run db:seed`. El
// rollback vacía igualmente las tablas y restaura las columnas en claro.

const PLAIN_COLUMNS = ['number', 'expiryMonth', 'expiryYear', 'cvv'];
const ENCRYPTED_COLUMNS = ['numberIv', 'numberCiphertext', 'expiryIv', 'expiryCiphertext', 'cvvIv', 'cvvCiphertext'];

exports.up = async function(knex) {
	await knex('USER_CARD').del();
	await knex('CARD').del();
	await knex.schema.alterTable('CARD', function(table) {
		for (const column of PLAIN_COLUMNS) table.dropColumn(column);
	});
	await knex.schema.alterTable('CARD', function(table) {
		for (const column of ENCRYPTED_COLUMNS) table.text(column).notNullable();
	});
	await knex.schema.alterTable('USER_CARD', function(table) {
		table.text('wrappedKey').notNullable();
	});
};

exports.down = async function(knex) {
	await knex('USER_CARD').del();
	await knex('CARD').del();
	await knex.schema.alterTable('USER_CARD', function(table) {
		table.dropColumn('wrappedKey');
	});
	await knex.schema.alterTable('CARD', function(table) {
		for (const column of ENCRYPTED_COLUMNS) table.dropColumn(column);
	});
	await knex.schema.alterTable('CARD', function(table) {
		table.string('number').notNullable();
		table.integer('expiryMonth').notNullable();
		table.integer('expiryYear').notNullable();
		table.string('cvv').notNullable();
	});
};
