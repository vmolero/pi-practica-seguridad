import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLoginRequest } from '../src/infrastructure/http/login-request.js';

describe('parseLoginRequest', () => {
  it('acepta una petición válida y normaliza el email', () => {
    assert.deepEqual(parseLoginRequest({ email: '  Empleado@Empresa.COM ', password: ' Demo ' }), {
      email: 'empleado@empresa.com',
      password: ' Demo ',
    });
  });

  const invalidBodies = {
    'cuerpo ausente': undefined,
    'cuerpo nulo': null,
    'cuerpo que es una lista': [],
    'cuerpo que es texto': 'email=a',
    'falta password': { email: 'a@b.com' },
    'falta email': { password: 'x' },
    'email vacío': { email: '', password: 'x' },
    'email solo con espacios': { email: '   ', password: 'x' },
    'password vacía': { email: 'a@b.com', password: '' },
    'password numérica': { email: 'a@b.com', password: 1234 },
    'email demasiado largo': { email: `${'a'.repeat(250)}@b.com`, password: 'x' },
    'password demasiado larga': { email: 'a@b.com', password: 'x'.repeat(129) },
  };

  for (const [name, body] of Object.entries(invalidBodies)) {
    it(`rechaza: ${name}`, () => {
      assert.equal(parseLoginRequest(body), null);
    });
  }

  it('acepta los límites exactos de longitud', () => {
    const email = `${'a'.repeat(248)}@b.com`;
    assert.equal(email.length, 254);
    assert.notEqual(parseLoginRequest({ email, password: 'x'.repeat(128) }), null);
  });
});
