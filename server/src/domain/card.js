// Tarjeta tal como la ve un usuario a través de su relación en USER_CARD:
// { id, number, expiryMonth, expiryYear, cvv, isOwner, createdAt, updatedAt }
// PROVISIONAL: número y CVV en texto claro hasta la fase 1.

/**
 * Convierte una fila de CARD (unida a USER_CARD) a los tipos de JavaScript,
 * para no depender de cómo devuelve SQLite booleanos y enteros.
 */
export function toCard(row) {
  return {
    id: row.id,
    number: row.number,
    expiryMonth: Number(row.expiryMonth),
    expiryYear: Number(row.expiryYear),
    cvv: row.cvv,
    isOwner: Boolean(row.isOwner),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
