// Cifra una tarjeta como lo hace el navegador (paso 10), para poder probar la
// API con curl y reproducir el ejemplo de docs/criptografia-implementada.md.
//
//   node scripts/cifrar-tarjeta.mjs <email> <contraseña> <número> <MM/AAAA> <cvv>
//     → el cuerpo JSON de POST /api/private/cards: id, number, expiry y cvv
//       cifrados con una clave de tarjeta nueva, y esa clave envuelta con la
//       clave pública del usuario (wrappedKey)
//   node scripts/cifrar-tarjeta.mjs <email> <contraseña> --abrir < tarjeta.json
//     → descifra una tarjeta tal como la devuelve la API (o el cuerpo anterior)
//       abriendo la clave privada del usuario con su contraseña
//
// Lee las claves del usuario de server/data/app.sqlite (hace falta haber
// sembrado) y usa los mismos módulos que el cliente. La contraseña y la clave
// privada no salen de este proceso.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirClavePrivada, importarClavePublica } from '../client/src/security/claves-usuario.js';
import { cifrarTarjeta, descifrarTarjeta } from '../client/src/security/tarjetas-cifradas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'server', 'package.json'));
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const abrir = args.includes('--abrir');
const [email, password, number, expiry, cvv] = args.filter((arg) => arg !== '--abrir');

if (!email || !password || (!abrir && (!number || !/^\d{2}\/\d{4}$/.test(expiry ?? '') || !cvv))) {
  console.error('Uso: node scripts/cifrar-tarjeta.mjs <email> <contraseña> <número> <MM/AAAA> <cvv>');
  console.error('     node scripts/cifrar-tarjeta.mjs <email> <contraseña> --abrir < tarjeta.json');
  process.exit(1);
}

const db = new Database(join(root, 'server', 'data', 'app.sqlite'), { readonly: true });
const user = db.prepare('select publicKey, encryptedPrivateKey, privateKeyIv from USER where email = ?').get(email);
db.close();
if (!user || !user.publicKey) {
  console.error(`No hay ningún usuario con claves para ${email} en server/data/app.sqlite`);
  process.exit(1);
}

if (abrir) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    const k_U = await abrirClavePrivada(password, user);
    const card = await descifrarTarjeta(k_U, JSON.parse(input));
    console.log(JSON.stringify(card));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  const K_U = await importarClavePublica(user.publicKey);
  const id = globalThis.crypto.randomUUID();
  const body = await cifrarTarjeta(K_U, { id, number: number.replace(/[\s-]/g, ''), expiry, cvv });
  console.log(JSON.stringify(body));
}
