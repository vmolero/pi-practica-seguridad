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

/**
 * Datos de una tarjeta que se envían al cliente: el número enmascarado (solo
 * los 4 últimos dígitos) y la caducidad. Nunca incluye el número completo ni
 * el CVV.
 */
export function toMaskedCard(card) {
  return {
    id: card.id,
    last4: card.number.slice(-4),
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    createdAt: card.createdAt,
  };
}
