# Diseño: paso 4 — tabla de tarjetas con relación N:N

## Context

- La base de datos (SQLite con Knex, migraciones en `server/migrations/*.cjs`)
  solo tiene la tabla `USER` (`id`, `name`, `email`, `password`, `isAdmin`).
  Las tablas usan nombres en mayúsculas y columnas en *camelCase*.
- Knex con `better-sqlite3` **no** activa las claves foráneas: SQLite las
  ignora mientras no se ejecute `PRAGMA foreign_keys = ON` en cada conexión.
- El acceso a datos sigue el patrón `createXRepository(knex)` de
  `user-repository.js`, y los tests usan `createTestDatabase()` de
  `server/test/helpers.js` (migraciones + seed sobre una base temporal).
- `paso-3-gestion-usuarios-admin` (propuesto, sin implementar) añade el
  borrado físico de usuarios.
- `fase-1-registro-y-cifrado` prevé una tabla `cards` con `id` (UUID generado
  en el cliente), `owner_id`, `version` y `envelope` cifrado, y una lista de
  claves envueltas por tarjeta "para poder compartir en la fase 2".
- Este paso no toca primitivas criptográficas: todas las tareas son [claude].

## Goals / Non-Goals

**Goals:**

- Un esquema que ya sea N:N, para que compartir en la fase 2 sea añadir filas
  y no migrar datos.
- Garantías en la propia base de datos: integridad referencial, una sola
  relación por pareja y un solo propietario por tarjeta.
- Un repositorio cuyas lecturas parten siempre del usuario, para que el
  control de acceso por relación no dependa de que cada ruta se acuerde de
  filtrar.

**Non-Goals:**

- API HTTP e interfaz (paso 5).
- Alias, titular o notas.
- Compartir tarjetas, permisos por relación o transferir la propiedad.
- Cifrado de los datos (fase 1).

## Decisions

### D1. Modelo N:N con tabla de unión y propietario explícito

```
USER (id) 1 ──< USER_CARD (userId, cardId, isOwner, createdAt) >── 1 CARD (id, ...)
```

`CARD` no tiene `ownerId`: la propiedad es un atributo de la relación
(`isOwner`). Así una sola tabla responde a "qué tarjetas ve el usuario u",
tanto propias como compartidas:

`Tarjetas(u) = { c ∈ CARD : ∃r ∈ USER_CARD, r.userId = u ∧ r.cardId = c.id }`.

*Alternativa descartada:* `CARD.ownerId` más una tabla `CARD_SHARE` para la
fase 2. Es igual de válido, pero obliga a consultar dos sitios para listar y
duplica la lógica de acceso. La propuesta pide explícitamente N:N.

### D2. Un propietario por tarjeta, garantizado por un índice único parcial

```sql
CREATE UNIQUE INDEX user_card_one_owner ON USER_CARD (cardId) WHERE isOwner = 1;
```

SQLite admite índices parciales; Knex no los expresa en su *builder*, así que
se crea con `knex.raw` en la migración. Con D1 y D2:
`∀c ∈ CARD : |{ r ∈ USER_CARD : r.cardId = c.id ∧ r.isOwner }| ≤ 1`, y el
repositorio (D4) asegura el `= 1`.

### D3. "Un usuario por tarjeta" en la aplicación, no en el esquema

La restricción de la fase 1 (cada tarjeta tiene exactamente un usuario) se
cumple porque el repositorio solo inserta en `USER_CARD` al crear la tarjeta y
no ofrece ningún método para añadir otra relación. No se pone un índice único
sobre `cardId` porque habría que quitarlo en la fase 2 con una migración que
recrea la tabla (SQLite no permite `DROP CONSTRAINT`).

### D4. Repositorio `createCardRepository(knex)`

| Método | Comportamiento |
|---|---|
| `listForUser(userId)` | `JOIN USER_CARD`, ordenado por `createdAt` y después `id`; devuelve tarjetas con `isOwner`. |
| `findForUser(cardId, userId)` | La tarjeta si existe la relación; `undefined` en otro caso. |
| `createForOwner(ownerId, { number, expiryMonth, expiryYear, cvv })` | Transacción: `id = randomUUID()`, inserta en `CARD` y en `USER_CARD` con `isOwner = true`; devuelve la tarjeta creada. |
| `updateForOwner(cardId, ownerId, changes)` | Actualiza solo los campos presentes en `changes` (`number`, `expiryMonth`, `expiryYear`, `cvv`) y `updatedAt`, si existe la relación con `isOwner = true`; devuelve la tarjeta actualizada o `undefined`. |
| `removeForOwner(cardId, ownerId)` | Borra la tarjeta si existe la relación con `isOwner = true` (la cascada borra sus filas de `USER_CARD`); devuelve si había fila. |
| `removeOwnedBy(userId, trx?)` | Borra de `CARD` las tarjetas cuya relación con `userId` tiene `isOwner = true`; acepta una transacción externa. |

Las operaciones de escritura filtran por propietario dentro de la propia
consulta (`WHERE id = ? AND id IN (SELECT cardId FROM USER_CARD WHERE userId = ? AND isOwner = 1)`),
de modo que la regla se cumple aunque la capa de aplicación se olvide de
comprobarla antes. Distinguir "no existe" de "existe pero no eres el
propietario" es cosa de la aplicación (paso 5), con `findForUser`.

Los datos se devuelven tal cual (con el CVV); qué se expone por HTTP lo decide
la capa de aplicación del paso 5. Una función de dominio `toCard(row)` en
`server/src/domain/card.js` convierte la fila (booleano de `isOwner`,
enteros de caducidad) para que el resto del código no dependa de cómo SQLite
devuelve los tipos.

### D5. Identificador UUID generado en el servidor

`CARD.id` es un UUID v4 de `node:crypto.randomUUID()`. Es compatible con la
fase 1, donde el cliente generará el UUID antes de cifrar para incluirlo en
los datos asociados de AES-GCM; y no revela cuántas tarjetas hay ni permite
adivinar identificadores ajenos (aunque el acceso ya se filtra por relación).

### D6. Tipos de las columnas

`number` y `cvv` en texto (ceros a la izquierda; un número de 19 dígitos no
cabe en un entero de JavaScript sin pérdida). `expiryMonth` y `expiryYear`
enteros, para poder comparar con la fecha actual al validar en el paso 5.
Fechas en texto ISO 8601 con
`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`, como hacía la antigua tabla `notes`.
La validación de formato (Luhn, rangos) se hace en la capa HTTP del paso 5;
el esquema solo impone `NOT NULL`.

### D7. Claves foráneas en todas las conexiones

En `knexfile.cjs`, `pool.afterCreate` ejecuta `PRAGMA foreign_keys = ON`.
Como `createDatabase()` reutiliza esa configuración, lo heredan la app, los
tests, las migraciones y los seeds. Riesgo: la migración del paso 1 recrea
`USER` con `dropTable` + `renameTable`; con claves foráneas activas eso
rompería si ya hubiera filas que apunten a `USER`. Hoy no ocurre porque esa
migración es anterior a `USER_CARD`, pero cualquier migración futura que
recree `USER` o `CARD` debe desactivar las claves foráneas temporalmente
(se documenta en la memoria).

### D8. Borrado de usuarios

`ON DELETE CASCADE` en `USER_CARD.userId` elimina las relaciones, pero no las
tarjetas. Para no dejar tarjetas huérfanas, el borrado de un usuario ejecuta en
una transacción `cardRepository.removeOwnedBy(id, trx)` y después borra el
usuario. Si el paso 3 ya está implementado al aplicar este cambio, se modifica
su `remove`; si no, se deja anotado en las tareas del paso 3.

*Alternativa descartada:* un *trigger* de SQLite que borre las tarjetas sin
propietario. Funciona, pero esconde lógica de negocio en la base de datos y la
fase 2 tendrá que decidir qué pasa con las tarjetas compartidas de un
propietario eliminado.

### D9. Se guarda el CVV, ignorando PCI DSS

PCI DSS prohíbe almacenar el código de verificación de la tarjeta después de
la autorización. El proyecto decide ignorar esa norma: el objetivo de la
aplicación es que el empleado tenga todos los datos de su tarjeta guardados, y
esto es un ejercicio docente para practicar criptografía y seguridad, no un
producto sujeto a cumplimiento normativo.
Por eso `cvv` es una columna obligatoria. La especificación
`fase-1-registro-y-cifrado/specs/boveda-tarjetas`, que decía "el código de
seguridad (CVV) no SHALL guardarse", se actualiza para que el CVV forme parte
de los datos cifrados de la tarjeta. La memoria debe dejar constancia de esta
decisión y de que en un producto real no sería admisible.

## Risks / Trade-offs

- [Número y CVV en texto claro en la base de datos] → Marcado como
  PROVISIONAL en la migración, el repositorio y la memoria; solo hay datos de
  prueba. La fase 1 sustituye estas columnas por el sobre cifrado.
- [Guardar el CVV incumple PCI DSS] → Decisión consciente (D9), documentada en
  la memoria; en la fase 1 el CVV queda cifrado de extremo a extremo como el
  resto de datos.
- [Activar las claves foráneas puede romper código existente] → Solo el seed
  borra `USER`; se reordena. Los tests completos se ejecutan tras el cambio.
- [La regla "un usuario por tarjeta" no está en el esquema] → Cubierta por
  tests del repositorio y por la ausencia de cualquier método que añada
  relaciones (D3).

## Migration Plan

1. Migración nueva `..._create_card_tables.cjs`: crea `CARD`, `USER_CARD`, el
   índice `user_card_one_owner` y un índice sobre `USER_CARD(cardId)`.
   `down` borra `USER_CARD` y después `CARD`.
2. `npm run db:migrate --workspace=server` y `npm run db:seed --workspace=server`.
3. Rollback: `npm run db:rollback --workspace=server` y revertir el commit; la
   tabla `USER` no se toca.

Hacia la fase 1: las columnas `number`, `expiryMonth`, `expiryYear` y `cvv` se
sustituyen por `envelope` y `version`; la clave envuelta de cada usuario puede
vivir en `USER_CARD` (una por relación), lo que encaja con la lista de claves
envueltas de su diseño. Hacia la fase 2: compartir es insertar filas con
`isOwner = false`.

## Open Questions

- En la fase 2, al eliminar al propietario de una tarjeta compartida, ¿se
  borra la tarjeta o se transfiere la propiedad? Hoy se borra (D8).
