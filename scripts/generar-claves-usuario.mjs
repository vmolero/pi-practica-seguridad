// Imprime en JSON el material de claves que el navegador genera al dar de alta
// un usuario (paso 7), para poder probar el alta con curl o desde un script.
//
//   node scripts/generar-claves-usuario.mjs <contraseña>
//     → { publicKey, encryptedPrivateKey, privateKeyIv }
//   node scripts/generar-claves-usuario.mjs <contraseña> <nombre> <email> [--admin]
//     → el cuerpo completo de POST /api/private/admin/users, con loginKey
//       (la clave de login K_L en base64) en lugar de la contraseña
//
// Usa el mismo módulo que el cliente (solo Web Crypto, disponible en Node 20+).

import { derivarClaves, generarClavesUsuario, toBase64 } from '../client/src/security/claves-usuario.js';

const args = process.argv.slice(2);
const isAdmin = args.includes('--admin');
const [password, name, email] = args.filter((arg) => arg !== '--admin');

if (!password || (name && !email)) {
  console.error('Uso: node scripts/generar-claves-usuario.mjs <contraseña> [<nombre> <email>] [--admin]');
  process.exit(1);
}

const claves = await generarClavesUsuario(password);
const { K_L, K_D } = await derivarClaves(password);
K_D.fill(0);
const body = name ? { name, email, loginKey: toBase64(K_L), isAdmin, ...claves } : claves;
console.log(JSON.stringify(body));
