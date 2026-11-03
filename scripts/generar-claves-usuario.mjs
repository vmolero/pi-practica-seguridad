// Imprime en JSON el material de claves que el navegador genera al dar de alta
// un usuario (paso 7), para poder probar el alta con curl o desde un script.
//
//   node scripts/generar-claves-usuario.mjs <contraseña>
//     → { publicKey, encryptedPrivateKey, privateKeyIv }
//   node scripts/generar-claves-usuario.mjs <contraseña> <nombre> <email> [--admin]
//     → el cuerpo completo de POST /api/private/admin/users
//
// Usa el mismo módulo que el cliente (solo Web Crypto, disponible en Node 20+).

import { generarClavesUsuario } from '../client/src/security/claves-usuario.js';

const args = process.argv.slice(2);
const isAdmin = args.includes('--admin');
const [password, name, email] = args.filter((arg) => arg !== '--admin');

if (!password || (name && !email)) {
  console.error('Uso: node scripts/generar-claves-usuario.mjs <contraseña> [<nombre> <email>] [--admin]');
  process.exit(1);
}

const claves = await generarClavesUsuario(password);
const body = name ? { name, email, password, isAdmin, ...claves } : claves;
console.log(JSON.stringify(body));
