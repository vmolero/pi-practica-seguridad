// Usuarios y tarjeta de prueba solo para desarrollo.
// PROVISIONAL: las contraseñas y los datos de la tarjeta se guardan en texto
// claro (pasos 1–4, sin seguridad).

const { randomUUID } = require('node:crypto');

exports.seed = async function(knex) {
	// Orden inverso a las claves foráneas.
	await knex('USER_CARD').del();
	await knex('CARD').del();
	await knex('USER').del();

	const [employee] = await knex('USER').insert([
		{ name: 'Empleado de prueba', email: 'empleado@empresa.com', password: 'demo1234', isAdmin: false },
	]).returning('id');
	await knex('USER').insert([
		{ name: 'Administrador de prueba', email: 'admin@empresa.com', password: 'admin1234', isAdmin: true },
	]);

	// Número de prueba de Visa: supera Luhn y no corresponde a ninguna tarjeta real.
	const cardId = randomUUID();
	await knex('CARD').insert({ id: cardId, number: '4111111111111111', expiryMonth: 12, expiryYear: 2030, cvv: '123' });
	await knex('USER_CARD').insert({ userId: employee.id, cardId, isOwner: true });
};
