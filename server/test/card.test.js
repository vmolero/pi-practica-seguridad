import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCard } from '../src/domain/card.js';

describe('toCard', () => {
  it('convierte isOwner a booleano y la caducidad a enteros, conservando el texto', () => {
    const row = {
      id: 'b6f1c2de-0000-4000-8000-000000000001',
      number: '4111111111111111',
      expiryMonth: '3',
      expiryYear: 2030,
      cvv: '012',
      isOwner: 1,
      createdAt: '2026-10-14T09:00:00.000Z',
      updatedAt: '2026-10-14T09:00:00.000Z',
    };
    assert.deepEqual(toCard(row), {
      ...row,
      expiryMonth: 3,
      isOwner: true,
    });
  });
});
