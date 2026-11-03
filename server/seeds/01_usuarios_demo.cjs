// Usuarios y tarjeta de prueba solo para desarrollo.
// PROVISIONAL: los datos de la tarjeta se guardan en texto claro (paso 4).
// La contraseña ya no se guarda (paso 8): se deriva K_L con el mismo módulo
// que usa el navegador y se guarda su sal y su hash con la pimienta de
// LOGIN_PEPPER (o la de desarrollo), que debe ser la misma con la que se
// arranque el servidor. Las claves del usuario (paso 7) también se generan
// con ese módulo, de modo que la clave privada se abre con la contraseña.

const { randomUUID } = require('node:crypto');

exports.seed = async function(knex) {
	// Módulos ESM; el del cliente solo usa Web Crypto, disponible en Node 20+.
	const { derivarClaves, generarClavesUsuario } = await import('../../client/src/security/claves-usuario.js');
	const { createLoginKeyService } = await import('../src/infrastructure/security/login-key-service.js');
	const { loadConfig } = await import('../src/config.js');
	const loginKeyService = createLoginKeyService({ pepper: loadConfig(process.env).loginPepper });

	// Sal, hash de K_L y par de claves de un usuario de prueba.
	async function credentials(password) {
		const { K_L, K_D } = await derivarClaves(password);
		K_D.fill(0);
		const loginKeySalt = loginKeyService.newSalt();
		const loginKeyHash = await loginKeyService.hash(K_L, loginKeySalt);
		K_L.fill(0);
		return { loginKeySalt, loginKeyHash, ...(await generarClavesUsuario(password)) };
	}

	// Orden inverso a las claves foráneas.
	await knex('USER_CARD').del();
	await knex('CARD').del();
	await knex('USER').del();

	const [employee] = await knex('USER').insert([
		{ name: 'Empleado de prueba', email: 'empleado@empresa.com', isAdmin: false, ...(await credentials('demo1234')) },
	]).returning('id');
	await knex('USER').insert([
		{ name: 'Administrador de prueba', email: 'admin@empresa.com', isAdmin: true, ...(await credentials('admin1234')) },
	]);

	// Número de prueba de Visa: supera Luhn y no corresponde a ninguna tarjeta real.
	const cardId = randomUUID();
	await knex('CARD').insert({ id: cardId, number: '4111111111111111', expiryMonth: 12, expiryYear: 2030, cvv: '123' });
	await knex('USER_CARD').insert({ userId: employee.id, cardId, isOwner: true });
};
