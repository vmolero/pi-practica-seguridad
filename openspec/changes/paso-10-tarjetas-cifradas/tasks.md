# Tareas

Requisito previo: `paso-9-abrir-clave-privada-en-login` implementado. Todo es
[claude] salvo la revisión final del módulo de cifrado por el equipo. Orden:
módulo de seguridad del cliente → migración y semilla → servidor → cliente
(`cards.js` y panel) → script y verificación → documentación.

## 1. Módulo de cifrado de tarjetas (cliente)

- [x] 1.1 [claude] Crear `client/src/security/tarjetas-cifradas.js` según `design.md` D1, D2 y D5: `cifrarTarjeta(K_U, { id, number, expiry, cvv })`, `abrirClaveTarjeta(k_U, wrappedKey)`, `cifrarValores(K_t, id, valores)`, `descifrarTarjeta(k_U, tarjetaCifrada)` y `TarjetaCifradaError`; AES-256-GCM con `VI` de 12 bytes y AAD `"<id>:<campo>"`, relleno a 19/4 caracteres, `K_t` de 32 bytes envuelta con RSA-OAEP mediante `subtle.encrypt`, bytes en crudo a cero tras importar; sin DOM; comentario de cabecera con la notación de la memoria
- [x] 1.2 [claude] Crear `client/src/security/tarjetas-cifradas.test.js` (`node --test`): ida y vuelta con un par de prueba; tamaños fijos (35/23/20 y 256) con 13 y 19 dígitos y CVV de 3 y 4; dos cifrados de la misma tarjeta distintos; `k_U` de otro par falla; byte alterado en `ciphertext` y en `iv` lanza `TarjetaCifradaError`; valor copiado a otra tarjeta (otro `id`) y a otro campo falla; `cifrarValores` con la `K_t` abierta descifra con el `wrappedKey` original
- [x] 1.3 [claude] Añadir el script de test del cliente si hace falta para que `npm test --workspace=client` recoja el fichero nuevo, y comprobar que sigue en verde *(Verificado: `npm test --workspace=client` ya recogía `src/**/*.test.js`; 37/37.)*

## 2. Migración y semilla

- [x] 2.1 [claude] Crear `server/migrations/20261110180000_encrypt_card_columns.cjs` según D4: vaciar `USER_CARD` y `CARD`, sustituir las cuatro columnas en claro por `numberIv`, `numberCiphertext`, `expiryIv`, `expiryCiphertext`, `cvvIv`, `cvvCiphertext` (`text`, `notNullable`) y añadir `USER_CARD.wrappedKey` (`text`, `notNullable`); `down` inverso; comentario de cabecera explicando por qué vacía las tablas
- [x] 2.2 [claude] `server/seeds/01_usuarios_demo.cjs`: cifrar la tarjeta `4111111111111111`, `12/2030`, `123` con `cifrarTarjeta` e `importarClavePublica` sobre la `publicKey` recién generada del empleado; guardar columnas y `wrappedKey`; actualizar el comentario de cabecera
- [x] 2.3 [claude] Ampliar `server/test/database.test.js`: columnas nuevas presentes y las antiguas ausentes en `CARD`, `wrappedKey` obligatoria en `USER_CARD`, la migración sobre una base con una tarjeta en claro del paso 5 deja `CARD` y `USER_CARD` vacías y `USER` intacto; la tarjeta de la semilla se descifra con la `k_U` del empleado abierta con `demo1234`

## 3. Servidor

- [x] 3.1 [claude] `server/test/helpers.js`: `encryptedTestCard(publicKey, { id, number, expiry, cvv } = {})` con el módulo del cliente y `getTestUserKeys`; `employeeKeys(knex)` que lee `publicKey`, `encryptedPrivateKey` y `privateKeyIv` del empleado de la semilla
- [x] 3.2 [claude] `server/src/infrastructure/http/card-request.js`: sustituir la validación de contenido por la estructural de D3 (`parseCreateCardRequest`: `id` UUID v4 en minúsculas, tres valores `{ iv, ciphertext }` con tamaños exactos, `wrappedKey` de 256 bytes; `parseUpdateCardRequest`: subconjunto no vacío de los tres valores, sin `id` ni `wrappedKey`); eliminar `passesLuhn` y la lógica de caducidad; reescribir `server/test/card-request.test.js` (todos los escenarios de «Validación de los datos de la tarjeta»)
- [x] 3.3 [claude] `server/src/domain/card.js`: `toCard(row)` con las columnas nuevas y `wrappedKey`; `toEncryptedCard(card)` → `{ id, number: { iv, ciphertext }, expiry, cvv, wrappedKey, createdAt }` en lugar de `toMaskedCard`; actualizar `server/test/card.test.js`
- [x] 3.4 [claude] `server/src/infrastructure/database/card-repository.js`: `createForOwner(ownerId, { id, number, expiry, cvv, wrappedKey })` inserta `CARD` con el `id` del cliente y `USER_CARD` con `wrappedKey` en una transacción, y traduce la violación de clave primaria a un error reconocible; `cardsOf` selecciona las columnas nuevas y `USER_CARD.wrappedKey`; `updateForOwner` acepta solo los pares `iv`/`ciphertext` de los valores enviados; actualizar `server/test/card-repository.test.js` (incluye `id` repetido y que `wrappedKey` no cambia al modificar)
- [x] 3.5 [claude] `server/src/application/errors.js`: `CardConflictError` (`La tarjeta ya existe`); `server/src/application/card-service.js`: `create` lanza `CardConflictError` ante el `id` repetido y todo pasa por `toEncryptedCard`; actualizar `server/test/card-service.test.js`
- [x] 3.6 [claude] `server/src/infrastructure/http/cards-router.js`: `409` para `CardConflictError`; reescribir `server/test/cards.test.js` con cuerpos cifrados reales para el empleado de la semilla: `201` devuelve lo enviado, `GET` lo repite y `descifrarTarjeta` con la `k_U` del empleado recupera los valores; `409` con `id` repetido (también de otro usuario); `PATCH` de un valor; `400` de estructura; `wrappedKey` en `PATCH` → `400`; control de acceso (`401`, `404`, `403`) sin cambios; respuestas sin ningún valor en claro
- [x] 3.7 [claude] Comprobar que `user-admin-service` y el borrado de usuarios con tarjetas siguen pasando (`removeOwnedBy`) y que `admin-users.test.js` no depende de columnas eliminadas *(Verificado: `admin-users.test.js` pasó a `encryptedTestCard`; 241/241.)*

## 4. Cliente: API de tarjetas y panel

- [x] 4.1 [claude] `client/src/api/cards.js` según D6 y D7: `listCards()` descifra cada tarjeta con `getUserKeys().privateKey` y devuelve resúmenes (`last4`, `expiryMonth`, `expiryYear`, `createdAt`, `wrappedKey`, valores cifrados) o `{ id, createdAt, damaged: true }`; `createCard(datos)` genera `id` con `crypto.randomUUID()`, convierte la caducidad a `MM/AAAA`, cifra con `publicKey` y envía; `updateCard(card, changes)` abre `K_t`, cifra solo los cambios y envía; sin claves → `SessionExpiredError`; `409` → error con el mensaje del servidor; descartar número y CVV descifrados tras calcular el resumen
- [x] 4.2 [claude] `client/src/components/CardDashboard.jsx`: fila «Tarjeta dañada: no se ha podido descifrar.» sin «Editar» y con «Eliminar»; `handleUpdate` pasa la tarjeta completa a `updateCard`; sin cambios en los campos, mensajes ni confirmaciones; comprobar que nada descifrado llega a la consola
- [x] 4.3 [claude] `client/src/validation/card.js`: actualizar el comentario de cabecera (ya es la única validación de contenido) y `card.test.js` si cambia algo; `formatExpiry` se reutiliza

## 5. Script de ejemplo y verificación

- [x] 5.1 [claude] Crear `scripts/cifrar-tarjeta.mjs <email> <contraseña> <número> <MM/AAAA> <cvv>` según D8 (lee las claves del usuario de `server/data/app.sqlite`, imprime el cuerpo JSON cifrado; con `--abrir` descifra el JSON de la entrada estándar con la contraseña) y documentarlo en su cabecera
- [x] 5.2 [claude] Con `npm run dev`: login del empleado muestra `•••• 1111` y `12/30`; alta de una tarjeta nueva desde el formulario (la petición solo lleva cifrado); edición de la caducidad y del número; borrado; alta de la misma tarjeta desde `curl` con el script → `409` si se repite el `id`; `localStorage`, `sessionStorage` y cookies vacíos; nada en la consola *(Verificado con Playwright headless contra `npm run dev`: 20/20 comprobaciones, incluidas la petición solo cifrada, `201` y `409` desde `curl` y almacenamiento vacío.)*
- [x] 5.3 [claude] Caso de tarjeta dañada: alterar `numberCiphertext` de una tarjeta del empleado en `server/data/app.sqlite`, comprobar la fila «Tarjeta dañada» con solo «Eliminar» y que las demás se ven; eliminarla; restaurar con `npm run db:seed --workspace=server` *(Verificado: fila «Tarjeta dañada: no se ha podido descifrar.» solo con «Eliminar», la otra tarjeta visible, eliminada y semilla restaurada.)*
- [x] 5.4 [claude] `npm test --workspace=server`, `npm test --workspace=client`, `npm run build --workspace=client`, `openspec validate paso-10-tarjetas-cifradas --strict` *(Servidor 241/241, cliente 37/37, build OK, cambio válido.)*

## 6. Documentación

- [x] 6.1 [claude] `README.md`: «Estado actual» / «Seguridad» (tarjetas cifradas de extremo a extremo: `K_t`, GCM con datos asociados, `w_U`); sección del panel (qué descifra el navegador y qué guarda en memoria; «Tarjeta dañada»); «Base de datos» (columnas nuevas, la migración vacía las tarjetas, volver a sembrar); «API» (contrato de `/api/private/cards` con `409`, ejemplos de `curl` usando `scripts/cifrar-tarjeta.mjs`)
- [x] 6.2 [claude] `docs/primera-memoria/implementacion-y-seguridad.md`: sección nueva «Tarjetas cifradas de extremo a extremo (paso 10)» con notación (`K_t`, `VI_x`, `c_x`, `AAD_x`, `w_U`), flujo de alta, listado y edición, quién conoce cada dato y «Lo que este paso no protege» (servidor puede borrar o duplicar, `k_U`/`K_t` expuestas a XSS, `c_kU`/`K_U` sin integridad ni firma, CVV guardado por exigencia de la práctica); actualizar la descripción del paso 5 (ya no en claro), «Lo que este paso no protege» del paso 9 (`k_U` ya se usa) y «Trabajo futuro» (compartir, rotación de `K_t`, firma de `K_U`, GCM para `c_kU`)
- [x] 6.3 [claude] `docs/primera-memoria/manual-de-usuario.md`: «Mis tarjetas» (los datos se cifran en tu navegador antes de enviarse; qué significa «Tarjeta dañada» y qué hacer); `docs/primera-memoria/stack-tecnologico.md`: AES-GCM y RSA-OAEP de Web Crypto en uso para las tarjetas, sin librerías nuevas
- [x] 6.4 [claude] `docs/criptografia-implementada.md`: añadir `tarjetas-cifradas.js` y `scripts/cifrar-tarjeta.mjs` a «Dónde está el código», la operación «Guardar y leer una tarjeta (paso 10)» paso a paso, el ejemplo con valores reales (cuerpo cifrado de la tarjeta de la semilla, tamaños, apertura con `demo1234`) reproducible con el script, y la tabla «Qué es provisional y qué falta» (cifrado de tarjetas → hecho; compartir y rotación → fase 2) *(Ejemplo recalculado con la tarjeta de la semilla y `scripts/cifrar-tarjeta.mjs`; los comandos de «Reprodúcelo tú» se han ejecutado.)*
- [x] 6.5 [claude] `docs/diagrama-secuencia-crear-tarjeta.md`: «Estado» pasa a implantado; AES-256-GCM con AAD, nombres reales de campos (`id`, `number.iv`, `number.ciphertext`, `wrappedKey`), respuesta `201` completa y `409`; resolver «Puntos que hay que decidir» con lo decidido; `docs/glosario-simbolos-diagramas.md`: símbolos `K_t`, `VI_x`, `c_x`, `AAD_x`, `w_U` si faltan
- [ ] 6.6 [equipo] Revisar `tarjetas-cifradas.js` (algoritmos, tamaños, datos asociados y borrado de `K_t` en crudo) y la sección de la memoria antes de archivar

## Workflow follow-up

- Archivar con `/opsx:archive` cuando los grupos 1 a 6 estén hechos; al
  archivar, `cifrado-tarjetas` pasa a ser spec principal y los deltas de
  `almacen-tarjetas` y `panel-tarjetas` se funden.
- Pendiente del paso 9 (no bloquea): firma de `K_U` y AES-GCM para `c_kU`, CSP.
- Fase 2: compartir (fila en `USER_CARD` con `w_V`), rotación de `K_t` con
  `version` al descompartir, mostrar el número completo bajo demanda.
