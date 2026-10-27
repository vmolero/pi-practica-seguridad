import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Certificados que genera `npm run cert`: el del cliente (lo ve el navegador)
// y el del servidor (lo verifica el proxy de /api).
const CLIENT_CERT = fileURLToPath(new URL('./certs/cert.pem', import.meta.url));
const CLIENT_KEY = fileURLToPath(new URL('./certs/key.pem', import.meta.url));
const SERVER_CERT = fileURLToPath(new URL('../server/certs/cert.pem', import.meta.url));

function readPem(file, description) {
  try {
    return readFileSync(file);
  } catch (error) {
    throw new Error(
      `No se puede leer ${description} (${file}): ${error.code ?? error.message}. `
        + 'Genera los certificados con "npm run cert" desde la raíz del proyecto.',
    );
  }
}

export default defineConfig(({ command }) => {
  // `vite build` no sirve nada y no necesita certificados.
  if (command !== 'serve') return { plugins: [react()] };

  return {
    plugins: [react()],
    server: {
      // Solo HTTPS: sin certificado Vite no arranca (no hay alternativa HTTP).
      https: {
        cert: readPem(CLIENT_CERT, 'el certificado del cliente'),
        key: readPem(CLIENT_KEY, 'la clave privada del cliente'),
      },
      proxy: {
        '/api': {
          // El certificado del servidor es la única autoridad de confianza:
          // si la API presenta otro, el proxy rechaza la conexión.
          target: {
            protocol: 'https:',
            host: 'localhost',
            port: 3000,
            ca: readPem(SERVER_CERT, 'el certificado del servidor'),
          },
          secure: true,
          changeOrigin: true,
        },
      },
    },
  };
});
