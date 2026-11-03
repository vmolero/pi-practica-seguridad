import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  ClavePrivadaError,
  abrirClavePrivada,
  derivarClaves,
  fromBase64,
  generarClavesUsuario,
  importarClavePublica,
} from './claves-usuario.js';

const PW = 'inicial123';
const { subtle } = globalThis.crypto;

// Pruebas de contrato: deben pasar tanto con la implementación provisional
// (SHA-256) como con la definitiva del equipo (SHA3-256).
describe('derivarClaves', () => {
  it('devuelve dos mitades de 16 bytes, deterministas y distintas', async () => {
    const first = await derivarClaves(PW);
    const second = await derivarClaves(PW);
    assert.equal(first.K_L.length, 16);
    assert.equal(first.K_D.length, 16);
    assert.deepEqual(first.K_L, second.K_L);
    assert.deepEqual(first.K_D, second.K_D);
    assert.notDeepEqual(first.K_L, first.K_D);
  });

  it('cambia con la contraseña', async () => {
    const a = await derivarClaves(PW);
    const b = await derivarClaves('inicial124');
    assert.notDeepEqual(a.K_L, b.K_L);
    assert.notDeepEqual(a.K_D, b.K_D);
  });
});

describe('generarClavesUsuario y abrirClavePrivada', () => {
  let claves;

  before(async () => {
    claves = await generarClavesUsuario(PW);
  });

  it('devuelve un VI de 16 bytes y una clave RSA de 2048 bits', async () => {
    assert.equal(fromBase64(claves.privateKeyIv).length, 16);
    const publicKey = await importarClavePublica(claves.publicKey);
    assert.equal(publicKey.algorithm.modulusLength, 2048);
    // c_kU es un múltiplo del bloque de AES.
    assert.equal(fromBase64(claves.encryptedPrivateKey).length % 16, 0);
  });

  it('ida y vuelta: lo cifrado con la pública se descifra con la privada abierta', async () => {
    const privateKey = await abrirClavePrivada(PW, claves);
    const publicKey = await importarClavePublica(claves.publicKey);
    const message = new TextEncoder().encode('tarjeta 4111');
    const ciphertext = await subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, message);
    const plaintext = await subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ciphertext);
    assert.deepEqual(new Uint8Array(plaintext), message);
  });

  it('con una contraseña incorrecta la apertura falla', async () => {
    await assert.rejects(abrirClavePrivada('otra-contraseña', claves), ClavePrivadaError);
  });

  it('dos altas con la misma contraseña dan VI y claves distintos', async () => {
    const otras = await generarClavesUsuario(PW);
    assert.notEqual(otras.privateKeyIv, claves.privateKeyIv);
    assert.notEqual(otras.publicKey, claves.publicKey);
    assert.notEqual(otras.encryptedPrivateKey, claves.encryptedPrivateKey);
  });

  it('no expone K_D ni la clave privada en claro', () => {
    assert.deepEqual(Object.keys(claves).sort(), ['encryptedPrivateKey', 'privateKeyIv', 'publicKey']);
  });
});
