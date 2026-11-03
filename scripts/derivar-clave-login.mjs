// Imprime la clave de login K_L (base64) que el navegador deriva de una
// contraseña (paso 8), para poder llamar a la API con curl.
//
//   node scripts/derivar-clave-login.mjs <contraseña>
//
// Usa el mismo derivarClaves que el cliente, así que sirve también para
// comprobar una implementación de SHA3 contra la del navegador.

import { derivarClaves, toBase64 } from '../client/src/security/claves-usuario.js';

const [password] = process.argv.slice(2);
if (!password) {
  console.error('Uso: node scripts/derivar-clave-login.mjs <contraseña>');
  process.exit(1);
}

const { K_L, K_D } = await derivarClaves(password);
K_D.fill(0);
console.log(toBase64(K_L));
