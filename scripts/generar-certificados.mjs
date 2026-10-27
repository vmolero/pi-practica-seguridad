// Genera con OpenSSL los dos certificados autofirmados de desarrollo: uno para
// el servidor (API) y otro para el cliente (Vite), cada uno con su propio par
// de claves. Uso: npm run cert [-- --force]
// Ver docs/primera-memoria/certificados-autofirmados.md.

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Parámetros de design.md D2 (pendientes de confirmar por el equipo).
const KEY_ALGORITHM = 'rsa:2048';
const DIGEST = '-sha256';
const VALIDITY_DAYS = '365';
const EXTENSIONS = [
  'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
  'basicConstraints=critical,CA:FALSE',
  'keyUsage=critical,digitalSignature,keyEncipherment',
  'extendedKeyUsage=serverAuth',
];

const TARGETS = [
  { name: 'servidor (API)', dir: join(ROOT, 'server', 'certs'), unit: 'API' },
  { name: 'cliente (Vite)', dir: join(ROOT, 'client', 'certs'), unit: 'Cliente web' },
];

const INSTALL_HELP = `No se encuentra OpenSSL. Instálalo y vuelve a ejecutar npm run cert:
  - Linux (Debian/Ubuntu): sudo apt install openssl
  - Windows: viene con Git for Windows (C:\\Program Files\\Git\\usr\\bin\\openssl.exe);
    añade esa carpeta al PATH o instala OpenSSL con
    winget install ShiningLight.OpenSSL.Light`;

// Sin shell: los argumentos llegan tal cual a OpenSSL, también en Windows y
// en Git Bash (que convertiría "/CN=..." en una ruta).
function openssl(args) {
  return spawnSync('openssl', args, { encoding: 'utf8' });
}

function generate({ name, dir, unit }, force) {
  const certFile = join(dir, 'cert.pem');
  const keyFile = join(dir, 'key.pem');
  const shown = relative(ROOT, certFile);

  if (existsSync(certFile) && !force) {
    console.log(`Certificado del ${name}: ya existe ${shown}, no se modifica (usa --force para regenerarlo).`);
    return true;
  }

  mkdirSync(dir, { recursive: true });
  const result = openssl([
    'req', '-x509', '-newkey', KEY_ALGORITHM, DIGEST, '-days', VALIDITY_DAYS, '-nodes',
    '-keyout', keyFile, '-out', certFile,
    '-subj', `/CN=localhost/O=Tarjetas de empresa/OU=${unit}`,
    ...EXTENSIONS.flatMap((extension) => ['-addext', extension]),
  ]);
  if (result.status !== 0) {
    console.error(`No se ha podido generar el certificado del ${name}:\n${result.stderr}`);
    return false;
  }

  // La clave privada solo la puede leer su propietario (sin efecto en Windows).
  if (process.platform !== 'win32') chmodSync(keyFile, 0o600);

  const fingerprint = openssl(['x509', '-in', certFile, '-noout', '-fingerprint', '-sha256']).stdout.trim();
  console.log(`Certificado del ${name} generado en ${shown}\n  ${fingerprint}`);
  return true;
}

const version = openssl(['version']);
if (version.error || version.status !== 0) {
  console.error(INSTALL_HELP);
  process.exit(1);
}

const force = process.argv.includes('--force');
const ok = TARGETS.map((target) => generate(target, force)).every(Boolean);
process.exit(ok ? 0 : 1);
