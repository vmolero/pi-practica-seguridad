import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';

const SECRET = 'a'.repeat(32);

describe('loadConfig', () => {
  it('usa JWT_SECRET y JWT_TTL_SECONDS si están definidos', () => {
    const config = loadConfig({ JWT_SECRET: SECRET, JWT_TTL_SECONDS: '5', PORT: '4000' });
    assert.deepEqual(config, { port: 4000, jwtSecret: SECRET, jwtTtlSeconds: 5 });
  });

  it('genera un secreto aleatorio y avisa si falta JWT_SECRET', () => {
    const warnings = [];
    const first = loadConfig({}, { warn: (message) => warnings.push(message) });
    const second = loadConfig({}, { warn: () => {} });

    assert.equal(warnings.length, 1);
    assert.ok(first.jwtSecret.length >= 32);
    assert.notEqual(first.jwtSecret, second.jwtSecret);
    assert.equal(first.jwtTtlSeconds, 3600);
    assert.equal(first.port, 3000);
  });

  it('rechaza un JWT_SECRET demasiado corto', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: 'corto' }), /al menos 32/);
  });

  it('rechaza un JWT_TTL_SECONDS que no es un entero positivo', () => {
    for (const value of ['0', '-1', '1.5', 'abc']) {
      assert.throws(() => loadConfig({ JWT_SECRET: SECRET, JWT_TTL_SECONDS: value }), /JWT_TTL_SECONDS/);
    }
  });
});
