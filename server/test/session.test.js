import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionUserFromClaims, toSessionClaims } from '../src/domain/session.js';

const user = { id: 7, name: 'Ana', email: 'ana@empresa.com', password: 'secreta', isAdmin: 1 };
const claims = { sub: '7', email: 'ana@empresa.com', name: 'Ana', isAdmin: true };

describe('toSessionClaims', () => {
  it('devuelve sub como texto, email, name e isAdmin booleano, sin contraseña', () => {
    assert.deepEqual(toSessionClaims(user), claims);
  });
});

describe('sessionUserFromClaims', () => {
  it('construye el usuario de la sesión a partir de claims válidos', () => {
    assert.deepEqual(sessionUserFromClaims({ ...claims, iss: 'x', iat: 1, exp: 2 }), {
      id: 7,
      email: 'ana@empresa.com',
      name: 'Ana',
      isAdmin: true,
    });
  });

  const invalidClaims = {
    'claims nulos': null,
    'sin sub': { ...claims, sub: undefined },
    'sub numérico (no texto)': { ...claims, sub: 7 },
    'sub no numérico': { ...claims, sub: 'abc' },
    'sub cero': { ...claims, sub: '0' },
    'sin email': { ...claims, email: undefined },
    'name no texto': { ...claims, name: 1 },
    'isAdmin no booleano': { ...claims, isAdmin: 'true' },
  };

  for (const [name, value] of Object.entries(invalidClaims)) {
    it(`devuelve null: ${name}`, () => {
      assert.equal(sessionUserFromClaims(value), null);
    });
  }
});
