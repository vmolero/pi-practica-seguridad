// Tarjeta tal como la ve un usuario a través de su relación en USER_CARD:
// { id, number, expiry, cvv, wrappedKey, isOwner, createdAt, updatedAt },
// donde number, expiry y cvv son { iv, ciphertext } en base64 (AES-256-GCM
// con la clave de la tarjeta) y wrappedKey es esa clave envuelta con la clave
// pública de ese usuario. El servidor no puede abrir nada de esto.

export const ENCRYPTED_FIELDS = ['number', 'expiry', 'cvv'];

/** Columnas de CARD que guardan cada valor cifrado: { iv, ciphertext }. */
export function columnsOf(field) {
  return { iv: `${field}Iv`, ciphertext: `${field}Ciphertext` };
}

/**
 * Convierte una fila de CARD (unida a USER_CARD) a la forma anterior, para no
 * depender de cómo devuelve SQLite los booleanos.
 */
export function toCard(row) {
  const card = { id: row.id };
  for (const field of ENCRYPTED_FIELDS) {
    const columns = columnsOf(field);
    card[field] = { iv: row[columns.iv], ciphertext: row[columns.ciphertext] };
  }
  return {
    ...card,
    wrappedKey: row.wrappedKey,
    isOwner: Boolean(row.isOwner),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Tarjeta que se envía al cliente: los valores cifrados y la clave envuelta
 * tal como están guardados. El servidor no conoce el número, así que ya no
 * puede devolver los 4 últimos dígitos: los calcula el navegador.
 */
export function toEncryptedCard(card) {
  return {
    id: card.id,
    number: card.number,
    expiry: card.expiry,
    cvv: card.cvv,
    wrappedKey: card.wrappedKey,
    createdAt: card.createdAt,
  };
}
