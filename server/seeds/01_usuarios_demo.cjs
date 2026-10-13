// Usuarios de prueba solo para desarrollo.
// PROVISIONAL: las contraseñas se guardan en texto claro (paso 1, sin seguridad).

exports.seed = async function(knex) {
	await knex('USER').del();
	await knex('USER').insert([
		{ name: 'Empleado de prueba', email: 'empleado@empresa.com', password: 'demo1234', isAdmin: false },
		{ name: 'Administrador de prueba', email: 'admin@empresa.com', password: 'admin1234', isAdmin: true },
	]);
};
