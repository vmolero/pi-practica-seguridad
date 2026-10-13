# Tareas

Este paso no toca primitivas criptográficas, así que todas las tareas son
[claude]. El equipo solo revisa la sección de la memoria sobre el modelo de
datos.

## 1. Esquema

- [x] 1.1 [claude] Activar `PRAGMA foreign_keys = ON` en `pool.afterCreate` de `server/knexfile.cjs` (`design.md` D7) y añadir un test que compruebe que una conexión de `createDatabase()` devuelve `1`
- [x] 1.2 [claude] Crear la migración `server/migrations/<timestamp>_create_card_tables.cjs` con `CARD`, `USER_CARD` (clave primaria compuesta, claves foráneas con `ON DELETE CASCADE`), el índice único parcial `user_card_one_owner` con `knex.raw` y un índice sobre `USER_CARD(cardId)`; comentario PROVISIONAL sobre el texto claro; `down` borra en orden inverso
- [x] 1.3 [claude] Verificar `npm run db:migrate`, `db:rollback` y de nuevo `db:migrate` en `server/` sobre una base limpia

## 2. Dominio y repositorio

- [x] 2.1 [claude] Crear `server/src/domain/card.js` con `toCard(row)` (booleano `isOwner`, enteros de caducidad) y su test unitario
- [x] 2.2 [claude] Crear `server/src/infrastructure/database/card-repository.js` con `listForUser`, `findForUser`, `createForOwner` (transacción, `randomUUID()`), `updateForOwner`, `removeForOwner` y `removeOwnedBy(userId, trx?)` según `design.md` D4, sin ningún método que relacione una tarjeta existente con otro usuario
- [x] 2.3 [claude] Crear `server/test/card-repository.test.js` sobre `createTestDatabase()` cubriendo cada escenario de `specs/almacen-tarjetas/spec.md`: CVV `012` conservado, UUID v4 y fechas, pareja duplicada rechazada, `userId` inexistente rechazado, segundo propietario rechazado, fila `isOwner = false` aceptada por el esquema, alta crea exactamente una relación, alta con propietario inexistente no deja fila en `CARD`, listado solo de las propias y ordenado, búsqueda de tarjeta ajena → `undefined`, modificación parcial conserva los demás campos y actualiza `updatedAt`, modificar o borrar sin ser propietario (relación con `isOwner = false` y sin relación) no cambia nada, borrado propio elimina `CARD` y sus filas de `USER_CARD`, `removeOwnedBy` no toca tarjetas de otros

## 3. Seed y borrado de usuarios

- [x] 3.1 [claude] Actualizar `server/seeds/01_usuarios_demo.cjs`: borrar `USER_CARD`, `CARD` y `USER` en ese orden y crear una tarjeta de prueba (número de test que supere Luhn, p. ej. `4111111111111111`) para el empleado de prueba; comprobar que el seed se puede ejecutar dos veces seguidas
- [x] 3.2 [claude] Si `paso-3-gestion-usuarios-admin` ya está implementado, hacer que el borrado de un usuario llame a `cardRepository.removeOwnedBy` y borre el usuario en la misma transacción, con un test de integración (usuario con dos tarjetas → desaparecen; tarjetas de otros intactas). Si no lo está, añadir esa tarea a `openspec/changes/paso-3-gestion-usuarios-admin/tasks.md`
- [x] 3.3 [claude] Ejecutar `npm test --workspace=server` y verificar que pasa entero, incluidos los tests anteriores sin cambiar sus aserciones

## 4. Documentación y verificación final

- [x] 4.1 [claude] Actualizar `README.md`: "Estado actual" (paso 4) y "Persistencia con SQLite" (tablas `CARD` y `USER_CARD`, claves foráneas activas, tarjeta de prueba del seed, aviso de texto claro provisional)
- [x] 4.2 [claude] Añadir a `docs/primera-memoria/implementacion-y-seguridad.md` la sección "Tabla de tarjetas (paso 4)": diagrama entidad-relación, notación de `design.md` D1–D2, por qué N:N desde ya, regla del propietario único y de un usuario por tarjeta en la fase 1, borrado de usuarios, qué queda en texto claro y cómo evolucionará en la fase 1 (sobre cifrado y clave envuelta por relación) y en la fase 2 (compartir); actualizar "Estructura del proyecto" y "Trabajo futuro"
- [x] 4.3 [claude] Documentar en la memoria la decisión de guardar el CVV ignorando PCI DSS (`design.md` D9): qué exige la norma, por qué la práctica se aparta de ella y que en un producto real no sería admisible
- [x] 4.4 [claude] Ejecutar `openspec validate paso-4-tabla-tarjetas --strict`
