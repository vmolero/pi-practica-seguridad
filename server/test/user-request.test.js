import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCreateUserRequest,
  parseRenameUserRequest,
  parseUserId,
} from '../src/infrastructure/http/user-request.js';
import { getTestUserKeys, loginKeyFor, weakPublicKey } from './helpers.js';

const KEYS = await getTestUserKeys();
const LOGIN_KEY = await loginKeyFor('inicial123');
const VALID = { name: 'Ana Pérez', email: 'ana@empresa.com', loginKey: LOGIN_KEY, ...KEYS };

describe('parseCreateUserRequest', () => {
  it('normaliza nombre y email, pone isAdmin a false por defecto y devuelve la clave de login en bytes', () => {
    const result = parseCreateUserRequest({ name: '  Ana Pérez ', email: ' Ana@Empresa.com ', loginKey: LOGIN_KEY, ...KEYS });
    assert.ok(result.loginKey instanceof Uint8Array);
    assert.equal(Buffer.from(result.loginKey).toString('base64'), LOGIN_KEY);
    const { loginKey: _loginKey, ...rest } = result;
    assert.deepEqual(rest, { name: 'Ana Pérez', email: 'ana@empresa.com', isAdmin: false, ...KEYS });
  });

  it('acepta isAdmin booleano', () => {
    assert.equal(parseCreateUserRequest({ ...VALID, isAdmin: true }).isAdmin, true);
  });

  it('rechaza cuerpos que no son un objeto', () => {
    for (const body of [null, undefined, 'texto', 42, [VALID]]) {
      assert.equal(parseCreateUserRequest(body), null);
    }
  });

  it('rechaza si falta un campo obligatorio', () => {
    for (const field of ['name', 'email', 'loginKey', 'publicKey', 'encryptedPrivateKey', 'privateKeyIv']) {
      const { [field]: _omitted, ...body } = VALID;
      assert.equal(parseCreateUserRequest(body), null, field);
    }
  });

  it('valida la longitud del nombre', () => {
    assert.equal(parseCreateUserRequest({ ...VALID, name: '   ' }), null);
    assert.equal(parseCreateUserRequest({ ...VALID, name: 'a'.repeat(101) }), null);
    assert.ok(parseCreateUserRequest({ ...VALID, name: 'a'.repeat(100) }));
  });

  it('valida el formato y la longitud del email', () => {
    for (const email of ['ana.empresa.com', 'ana@@empresa.com', 'a@b@c', '@empresa.com', 'ana@', 42]) {
      assert.equal(parseCreateUserRequest({ ...VALID, email }), null, String(email));
    }
    assert.equal(parseCreateUserRequest({ ...VALID, email: `${'a'.repeat(250)}@e.es` }), null);
  });

  it('exige una clave de login de exactamente 16 bytes en base64', () => {
    for (const loginKey of [Buffer.alloc(15, 1).toString('base64'), Buffer.alloc(17, 1).toString('base64'), 'x'.repeat(24), '', 42]) {
      assert.equal(parseCreateUserRequest({ ...VALID, loginKey }), null, String(loginKey));
    }
  });

  it('rechaza la contraseña: ya no viaja al servidor', () => {
    assert.equal(parseCreateUserRequest({ ...VALID, password: 'inicial123' }), null);
    const { loginKey: _loginKey, ...withPassword } = { ...VALID, password: 'inicial123' };
    assert.equal(parseCreateUserRequest(withPassword), null);
  });

  it('exige una clave pública RSA SPKI de al menos 2048 bits', () => {
    for (const publicKey of [weakPublicKey(), 'no-es-base64!', 'AAAA', 42, '']) {
      assert.equal(parseCreateUserRequest({ ...VALID, publicKey }), null, String(publicKey));
    }
  });

  it('exige un VI de exactamente 16 bytes', () => {
    const twelve = Buffer.alloc(12, 1).toString('base64');
    const seventeen = Buffer.alloc(17, 1).toString('base64');
    for (const privateKeyIv of [twelve, seventeen, 'AAAA=', 'A'.repeat(23), 42]) {
      assert.equal(parseCreateUserRequest({ ...VALID, privateKeyIv }), null, String(privateKeyIv));
    }
    assert.ok(parseCreateUserRequest({ ...VALID, privateKeyIv: Buffer.alloc(16, 1).toString('base64') }));
  });

  it('exige una clave privada cifrada de 16 a 4096 bytes en bloques de 16', () => {
    const bytes = (length) => Buffer.alloc(length, 1).toString('base64');
    for (const encryptedPrivateKey of [bytes(0), bytes(15), bytes(17), bytes(4112), 'no-base64!', 42]) {
      assert.equal(parseCreateUserRequest({ ...VALID, encryptedPrivateKey }), null, String(encryptedPrivateKey));
    }
    assert.ok(parseCreateUserRequest({ ...VALID, encryptedPrivateKey: bytes(16) }));
    assert.ok(parseCreateUserRequest({ ...VALID, encryptedPrivateKey: bytes(4096) }));
  });

  it('rechaza isAdmin no booleano y campos extra', () => {
    assert.equal(parseCreateUserRequest({ ...VALID, isAdmin: 'true' }), null);
    assert.equal(parseCreateUserRequest({ ...VALID, id: 7 }), null);
  });
});

describe('parseRenameUserRequest', () => {
  it('devuelve el nombre sin espacios en los extremos', () => {
    assert.deepEqual(parseRenameUserRequest({ name: '  Ana García ' }), { name: 'Ana García' });
  });

  it('rechaza nombres vacíos o demasiado largos', () => {
    assert.equal(parseRenameUserRequest({ name: '' }), null);
    assert.equal(parseRenameUserRequest({ name: 'a'.repeat(101) }), null);
    assert.equal(parseRenameUserRequest({}), null);
  });

  it('rechaza cualquier campo distinto de name', () => {
    assert.equal(parseRenameUserRequest({ name: 'Ana', isAdmin: true }), null);
    assert.equal(parseRenameUserRequest({ name: 'Ana', email: 'otro@empresa.com' }), null);
  });

  it('rechaza cuerpos que no son un objeto', () => {
    assert.equal(parseRenameUserRequest(null), null);
    assert.equal(parseRenameUserRequest(['Ana']), null);
  });
});

describe('parseUserId', () => {
  it('acepta enteros positivos', () => {
    assert.equal(parseUserId('1'), 1);
    assert.equal(parseUserId('42'), 42);
  });

  it('rechaza todo lo demás', () => {
    for (const value of ['0', '-1', 'abc', '1.5', '01', '', ' 1', '99999999999999999999', undefined]) {
      assert.equal(parseUserId(value), null, String(value));
    }
  });
});
