import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCreateUserRequest,
  parseRenameUserRequest,
  parseUserId,
} from '../src/infrastructure/http/user-request.js';

const VALID = { name: 'Ana Pérez', email: 'ana@empresa.com', password: 'inicial123' };

describe('parseCreateUserRequest', () => {
  it('normaliza nombre y email y pone isAdmin a false por defecto', () => {
    assert.deepEqual(
      parseCreateUserRequest({ name: '  Ana Pérez ', email: ' Ana@Empresa.com ', password: ' Inicial123 ' }),
      { name: 'Ana Pérez', email: 'ana@empresa.com', password: ' Inicial123 ', isAdmin: false },
    );
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
    for (const field of ['name', 'email', 'password']) {
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

  it('valida la longitud de la contraseña', () => {
    assert.equal(parseCreateUserRequest({ ...VALID, password: '1234567' }), null);
    assert.equal(parseCreateUserRequest({ ...VALID, password: 'a'.repeat(129) }), null);
    assert.equal(parseCreateUserRequest({ ...VALID, password: 12345678 }), null);
    assert.ok(parseCreateUserRequest({ ...VALID, password: '12345678' }));
    assert.ok(parseCreateUserRequest({ ...VALID, password: 'a'.repeat(128) }));
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
