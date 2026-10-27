import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { TlsConfigError, createHttpsServer } from '../src/infrastructure/http/https-server.js';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'tls');
const CERT_FILE = join(FIXTURES, 'cert.pem');
const KEY_FILE = join(FIXTURES, 'key.pem');
const OTHER_KEY_FILE = join(FIXTURES, 'otra-key.pem');

function createHealthApp() {
  const app = express();
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  return app;
}

// Hace una petición y devuelve { status, body } o el error de la conexión.
function request(module, options) {
  return new Promise((resolve) => {
    const req = module.get(options, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('error', (error) => resolve({ error }));
  });
}

describe('servidor HTTPS', () => {
  let server;
  let port;

  before(async () => {
    server = createHttpsServer({ app: createHealthApp(), certFile: CERT_FILE, keyFile: KEY_FILE });
    server.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('responde por HTTPS a un cliente que confía en el certificado', async () => {
    for (const host of ['localhost', '127.0.0.1']) {
      const result = await request(https, { host, port, path: '/api/health', ca: readFileSync(CERT_FILE) });
      assert.equal(result.status, 200, `host ${host}`);
      assert.deepEqual(JSON.parse(result.body), { status: 'ok' });
    }
  });

  it('un cliente que no confía en el certificado rechaza la conexión', async () => {
    const result = await request(https, { host: 'localhost', port, path: '/api/health' });
    assert.equal(result.error?.code, 'DEPTH_ZERO_SELF_SIGNED_CERT');
  });

  it('una petición HTTP en claro no recibe respuesta de la API', async () => {
    const result = await request(http, { host: 'localhost', port, path: '/api/health' });
    assert.ok(result.error, `se esperaba un error de conexión y llegó ${result.status}`);
    assert.equal(result.status, undefined);
  });
});

describe('createHttpsServer sin un certificado válido', () => {
  it('lanza TlsConfigError si falta el certificado', () => {
    const certFile = join(FIXTURES, 'no-existe.pem');
    assert.throws(
      () => createHttpsServer({ app: createHealthApp(), certFile, keyFile: KEY_FILE }),
      (error) => error instanceof TlsConfigError
        && error.message.includes(certFile)
        && error.message.includes('npm run cert'),
    );
  });

  it('lanza TlsConfigError si falta la clave', () => {
    const keyFile = join(FIXTURES, 'no-existe-key.pem');
    assert.throws(
      () => createHttpsServer({ app: createHealthApp(), certFile: CERT_FILE, keyFile }),
      (error) => error instanceof TlsConfigError && error.message.includes(keyFile),
    );
  });

  it('lanza TlsConfigError si la clave no corresponde al certificado', () => {
    assert.throws(
      () => createHttpsServer({ app: createHealthApp(), certFile: CERT_FILE, keyFile: OTHER_KEY_FILE }),
      (error) => error instanceof TlsConfigError && error.message.includes('npm run cert'),
    );
  });
});
