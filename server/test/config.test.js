import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
  DEFAULT_TLS_CERT_FILE, DEFAULT_TLS_KEY_FILE, DEVELOPMENT_LOGIN_PEPPER, loadConfig,
} from '../src/config.js';

const SECRET = 'a'.repeat(32);
const PEPPER = 'p'.repeat(16);
const silent = { warn: () => {} };

describe('loadConfig', () => {
  it('usa JWT_SECRET y JWT_TTL_SECONDS si están definidos', () => {
    const config = loadConfig({ JWT_SECRET: SECRET, JWT_TTL_SECONDS: '5', PORT: '4000', LOGIN_PEPPER: PEPPER });
    assert.deepEqual(config, {
      port: 4000,
      jwtSecret: SECRET,
      jwtTtlSeconds: 5,
      loginPepper: PEPPER,
      tlsCertFile: DEFAULT_TLS_CERT_FILE,
      tlsKeyFile: DEFAULT_TLS_KEY_FILE,
    });
  });

  it('genera un secreto aleatorio y avisa si falta JWT_SECRET', () => {
    const warnings = [];
    const first = loadConfig({ LOGIN_PEPPER: PEPPER }, { warn: (message) => warnings.push(message) });
    const second = loadConfig({ LOGIN_PEPPER: PEPPER }, { warn: () => {} });

    assert.equal(warnings.length, 1);
    assert.ok(first.jwtSecret.length >= 32);
    assert.notEqual(first.jwtSecret, second.jwtSecret);
    assert.equal(first.jwtTtlSeconds, 3600);
    assert.equal(first.port, 3000);
  });

  it('usa por defecto el certificado y la clave de server/certs/', () => {
    const config = loadConfig({ JWT_SECRET: SECRET });
    assert.equal(config.tlsCertFile, resolve(import.meta.dirname, '..', 'certs', 'cert.pem'));
    assert.equal(config.tlsKeyFile, resolve(import.meta.dirname, '..', 'certs', 'key.pem'));
  });

  it('usa TLS_CERT_FILE y TLS_KEY_FILE si están definidos', () => {
    const config = loadConfig({ JWT_SECRET: SECRET, TLS_CERT_FILE: 'otro/cert.pem', TLS_KEY_FILE: 'otro/key.pem' });
    assert.equal(config.tlsCertFile, resolve('otro/cert.pem'));
    assert.equal(config.tlsKeyFile, resolve('otro/key.pem'));
  });

  it('rechaza un JWT_SECRET demasiado corto', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: 'corto' }), /al menos 32/);
  });

  it('usa LOGIN_PEPPER sin avisos si tiene al menos 16 caracteres', () => {
    const warnings = [];
    const config = loadConfig({ JWT_SECRET: SECRET, LOGIN_PEPPER: PEPPER }, { warn: (m) => warnings.push(m) });
    assert.equal(config.loginPepper, PEPPER);
    assert.deepEqual(warnings, []);
  });

  it('rechaza un LOGIN_PEPPER demasiado corto', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: SECRET, LOGIN_PEPPER: 'p'.repeat(15) }, silent), /LOGIN_PEPPER/);
  });

  it('usa la pimienta de desarrollo y avisa si falta LOGIN_PEPPER', () => {
    const warnings = [];
    const config = loadConfig({ JWT_SECRET: SECRET }, { warn: (m) => warnings.push(m) });
    assert.equal(config.loginPepper, DEVELOPMENT_LOGIN_PEPPER);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /LOGIN_PEPPER/);
  });

  it('rechaza un JWT_TTL_SECONDS que no es un entero positivo', () => {
    for (const value of ['0', '-1', '1.5', 'abc']) {
      assert.throws(() => loadConfig({ JWT_SECRET: SECRET, JWT_TTL_SECONDS: value }), /JWT_TTL_SECONDS/);
    }
  });
});
