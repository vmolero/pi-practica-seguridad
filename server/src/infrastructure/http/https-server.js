import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';

const GENERATE_HINT = 'Genera el certificado con "npm run cert" desde la raíz del proyecto.';

/**
 * Error de configuración TLS que impide arrancar el servidor.
 */
export class TlsConfigError extends Error {
  constructor(message) {
    super(`${message}. ${GENERATE_HINT}`);
    this.name = 'TlsConfigError';
  }
}

function readPem(file, description) {
  try {
    return readFileSync(file);
  } catch (error) {
    throw new TlsConfigError(`No se puede leer ${description} (${file}): ${error.code ?? error.message}`);
  }
}

/**
 * Crea el servidor HTTPS de la API con el certificado y la clave indicados.
 * No hay alternativa por HTTP: si falta un fichero o la clave no corresponde
 * al certificado, lanza TlsConfigError y el servidor no debe arrancar.
 */
export function createHttpsServer({ app, certFile, keyFile }) {
  const cert = readPem(certFile, 'el certificado del servidor');
  const key = readPem(keyFile, 'la clave privada del servidor');

  try {
    return createServer({ cert, key }, app);
  } catch (error) {
    // Clave que no corresponde al certificado, o PEM no válido.
    throw new TlsConfigError(`El certificado (${certFile}) o la clave (${keyFile}) no son válidos: ${error.message}`);
  }
}
