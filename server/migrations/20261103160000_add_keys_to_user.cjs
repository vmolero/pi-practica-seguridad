// Par de claves del usuario (cambio claves-usuario-en-alta): la clave pública
// K_U en claro y la clave privada k_U cifrada con la clave de datos K_D
// (AES-128-CBC con el VI que se guarda al lado). Las tres columnas admiten
// NULL para no romper las filas creadas antes de este cambio.

exports.up = async function(knex) {
	await knex.schema.alterTable('USER', function(table) {
		table.text('publicKey').nullable();
		table.text('encryptedPrivateKey').nullable();
		table.text('privateKeyIv').nullable();
	});
};

exports.down = async function(knex) {
	await knex.schema.alterTable('USER', function(table) {
		table.dropColumn('publicKey');
		table.dropColumn('encryptedPrivateKey');
		table.dropColumn('privateKeyIv');
	});
};
