// Usuarios y tarjeta de prueba solo para desarrollo.
// La contraseña no se guarda (paso 8): se deriva K_L con el mismo módulo que
// usa el navegador y se guarda su sal y su hash con la pimienta de
// LOGIN_PEPPER (o la de desarrollo), que debe ser la misma con la que se
// arranque el servidor. Las claves del usuario (paso 7) también se generan
// con ese módulo, de modo que la clave privada se abre con la contraseña.
// La tarjeta de prueba (paso 10) se cifra con el módulo de tarjetas del
// cliente y su clave se envuelve con la clave pública del empleado: el
// navegador la descifra tras el login con `demo1234`.

const { randomUUID } = require('node:crypto');

exports.seed = async function(knex) {
	// Módulos ESM; los del cliente solo usan Web Crypto, disponible en Node 20+.
	const { derivarClaves, generarClavesUsuario, importarClavePublica } = await import('../../client/src/security/claves-usuario.js');
	const { cifrarTarjeta } = await import('../../client/src/security/tarjetas-cifradas.js');
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

	const employeeCredentials = await credentials('demo1234');
	const [employee] = await knex('USER').insert([
		{ name: 'Empleado de prueba', email: 'empleado@empresa.com', isAdmin: false, ...employeeCredentials },
	]).returning('id');
	await knex('USER').insert([
		{ name: 'Administrador de prueba', email: 'admin@empresa.com', isAdmin: true, ...(await credentials('admin1234')) },
	]);

	// Número de prueba de Visa: supera Luhn y no corresponde a ninguna tarjeta real.
	const K_U = await importarClavePublica(employeeCredentials.publicKey);
	const card = await cifrarTarjeta(K_U, { id: randomUUID(), number: '4111111111111111', expiry: '12/2030', cvv: '123' });
	await knex('CARD').insert({
		id: card.id,
		numberIv: card.number.iv,
		numberCiphertext: card.number.ciphertext,
		expiryIv: card.expiry.iv,
		expiryCiphertext: card.expiry.ciphertext,
		cvvIv: card.cvv.iv,
		cvvCiphertext: card.cvv.ciphertext,
	});
	await knex('USER_CARD').insert({ userId: employee.id, cardId: card.id, isOwner: true, wrappedKey: card.wrappedKey });
};
