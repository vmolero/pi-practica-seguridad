import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLoginKey, parseLoginRequest } from '../src/infrastructure/http/login-request.js';

const KEY_BYTES = Buffer.alloc(16, 7);
const KEY = KEY_BYTES.toString('base64'); // 24 caracteres

describe('parseLoginKey', () => {
  it('devuelve un Uint8Array de 16 bytes para base64 válido', () => {
    const key = parseLoginKey(KEY);
    assert.ok(key instanceof Uint8Array);
    assert.deepEqual(Buffer.from(key), KEY_BYTES);
  });

  it('rechaza longitudes distintas de 16 bytes, base64 mal formado y otros tipos', () => {
    for (const value of [
      Buffer.alloc(15, 7).toString('base64'),
      Buffer.alloc(17, 7).toString('base64'),
      'no-es-base64-de-16-bytes',
      `${KEY.slice(0, 22)}=!`,
      `${KEY.slice(0, 22)}AA`, // 24 caracteres sin relleno: no recodifica igual
      '',
      42,
      null,
      KEY_BYTES,
    ]) {
      assert.equal(parseLoginKey(value), null, String(value));
    }
  });
});

describe('parseLoginRequest', () => {
  it('acepta una petición válida, normaliza el email y devuelve la clave en bytes', () => {
    const result = parseLoginRequest({ email: '  Empleado@Empresa.COM ', loginKey: KEY });
    assert.equal(result.email, 'empleado@empresa.com');
    assert.deepEqual(Buffer.from(result.loginKey), KEY_BYTES);
    assert.deepEqual(Object.keys(result).sort(), ['email', 'loginKey']);
  });

  const invalidBodies = {
    'cuerpo ausente': undefined,
    'cuerpo nulo': null,
    'cuerpo que es una lista': [],
    'cuerpo que es texto': 'email=a',
    'falta loginKey': { email: 'a@b.com' },
    'falta email': { loginKey: KEY },
    'email vacío': { email: '', loginKey: KEY },
    'email solo con espacios': { email: '   ', loginKey: KEY },
    'loginKey vacía': { email: 'a@b.com', loginKey: '' },
    'loginKey numérica': { email: 'a@b.com', loginKey: 1234 },
    'loginKey de 15 bytes': { email: 'a@b.com', loginKey: Buffer.alloc(15, 7).toString('base64') },
    'loginKey de 17 bytes': { email: 'a@b.com', loginKey: Buffer.alloc(17, 7).toString('base64') },
    'loginKey que no es base64': { email: 'a@b.com', loginKey: '!!!!!!!!!!!!!!!!!!!!!!!!' },
    'email demasiado largo': { email: `${'a'.repeat(250)}@b.com`, loginKey: KEY },
    'con password como antes': { email: 'a@b.com', password: 'demo1234' },
    'con password además de loginKey': { email: 'a@b.com', loginKey: KEY, password: 'demo1234' },
    'con un campo extra': { email: 'a@b.com', loginKey: KEY, isAdmin: true },
  };

  for (const [name, body] of Object.entries(invalidBodies)) {
    it(`rechaza: ${name}`, () => {
      assert.equal(parseLoginRequest(body), null);
    });
  }

  it('acepta el límite exacto de longitud del email', () => {
    const email = `${'a'.repeat(248)}@b.com`;
    assert.equal(email.length, 254);
    assert.notEqual(parseLoginRequest({ email, loginKey: KEY }), null);
  });
});
