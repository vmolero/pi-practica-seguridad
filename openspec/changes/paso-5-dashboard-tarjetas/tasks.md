# Tareas

Requisito previo: `paso-4-tabla-tarjetas` implementado (tablas, repositorio
con `updateForOwner` y `removeForOwner`, y seed con tarjeta de prueba). Este
paso no toca primitivas criptográficas, así que todas las tareas son [claude].

## 1. Dominio y validación del servidor

- [ ] 1.1 [claude] Añadir `toMaskedCard(card)` a `server/src/domain/card.js` (`{ id, last4, expiryMonth, expiryYear, createdAt }`, nunca `number` ni `cvv`) con su test unitario
- [ ] 1.2 [claude] Añadir `CardNotFoundError` y `CardForbiddenError` a `server/src/application/errors.js` con los mensajes de `design.md` D2
- [ ] 1.3 [claude] Crear `server/src/infrastructure/http/card-request.js` con `parseCreateCardRequest(body, { now })`, `parseUpdateCardRequest(body, { now })`, `parseCardId(param)` (solo UUID) y la comprobación de Luhn según `design.md` D4
- [ ] 1.4 [claude] Crear `server/test/card-request.test.js` con `now` fijo: números de prueba válidos con espacios y guiones, Luhn fallido, 12 y 20 dígitos, letras, mes 0 y 13, año de dos cifras y a más de 20 años, caducado el mes pasado, caduca este mes, CVV de 2, 5 y con letras, campo extra `userId`, cuerpo que no es objeto; en la modificación, cuerpo vacío, `expiryMonth` sin `expiryYear`, cada campo por separado y que solo se devuelven los campos enviados; ids `123`, `abc` y UUID válido

## 2. Servicio y capa HTTP

- [ ] 2.1 [claude] Crear `server/src/application/card-service.js` con `createCardService({ cardRepository })`: `list(userId)`, `create(userId, data)`, `update(userId, cardId, changes)` y `remove(userId, cardId)` siguiendo los pasos de `design.md` D2 (`findForUser` → `404` si no hay relación, `403` si no es propietario, y `404` si la escritura no encuentra fila); todo lo devuelto pasa por `toMaskedCard`; comentario PROVISIONAL sobre el texto claro
- [ ] 2.2 [claude] Crear `server/test/card-service.test.js` con un repositorio falso: el alta llama a `createForOwner` con el usuario indicado, ninguna salida incluye `number` ni `cvv`, tarjeta sin relación → `CardNotFoundError`, relación con `isOwner = false` → `CardForbiddenError` sin llamar a `updateForOwner` ni `removeForOwner`, escritura que no encuentra fila → `CardNotFoundError`
- [ ] 2.3 [claude] Crear `server/src/infrastructure/http/cards-router.js` con `createCardsRouter({ cardService })`: `express.json()`, `GET /`, `POST /`, `PATCH /:id` y `DELETE /:id` usando `request.user.id`; id no UUID → `404`; JSON ilegible o datos inválidos → `400 { "error": "Datos de tarjeta no válidos" }`; `CardNotFoundError` → `404`, `CardForbiddenError` → `403`; `DELETE` correcto → `204` sin cuerpo
- [ ] 2.4 [claude] Montar el router en `/api/private/cards` desde `createPrivateRouter`, ampliar `createApp` para recibir `cardService` y conectarlo en `server/index.js` y `server/test/test-app.js`; los tests existentes siguen pasando sin cambiar sus aserciones

## 3. Pruebas de integración

- [ ] 3.1 [claude] Crear `server/test/cards.test.js` con `startTestServer()` (una instancia nueva para cada test que modifica datos) cubriendo todos los escenarios del lado del servidor de `specs/panel-tarjetas/spec.md`: `401` sin token; el administrador no ve la tarjeta del empleado y recibe `404` al modificarla o borrarla; id no UUID → `404`; relación `isOwner = false` insertada directamente → `403` en `PATCH` y `DELETE` sin cambios; listado con exactamente los cinco campos; usuario sin tarjetas → `[]`; alta correcta → `201`, aparece en el listado, una sola relación en `USER_CARD` y no visible para otros; `PATCH` solo de la caducidad conserva número y CVV (comprobado en la base de datos); `PATCH` del número cambia `last4`; `DELETE` → `204`, desaparece del listado y de `USER_CARD`, y un segundo `DELETE` → `404`; cada caso de validación de alta y modificación → `400` sin crear ni cambiar nada; JSON ilegible → `400`
- [ ] 3.2 [claude] Ejecutar `npm test --workspace=server` y verificar que pasa entero

## 4. Cliente

- [ ] 4.1 [claude] Crear `client/src/validation/card.js` con `validateCardForm(values, now, { partial })` y Luhn, con las mismas reglas que el servidor y los mensajes por campo de `design.md` D7 (en modo parcial, los campos vacíos se ignoran), y `client/src/validation/card.test.js` con la misma tabla de casos que 1.4, ejecutable con `node --test` (añadir el script `test` a `client/package.json`, que hoy no tiene; sin dependencias nuevas)
- [ ] 4.2 [claude] Crear `client/src/api/cards.js` (`listCards`, `createCard`, `updateCard`, `deleteCard` sobre `apiFetch`; mensaje del servidor ante `400/403/404`, con el `404` identificable para quitar la fila; mensaje genérico de conexión en otro caso)
- [ ] 4.3 [claude] Crear `client/src/components/CardDashboard.jsx`: sección "Mis tarjetas", lista `•••• 1234` con caducidad `MM/AA`, estado vacío `Todavía no has guardado ninguna tarjeta.`, formulario de alta con `<label>`, `inputMode="numeric"`, `autocomplete` `cc-number` / `cc-exp-month` / `cc-exp-year` / `cc-csc` y CVV `type="password"`, errores junto a cada campo, área `role="alert"`, CVV vaciado tras cada envío y formulario vaciado tras un alta correcta; sin `console.log` de datos ni almacenamiento del navegador
- [ ] 4.4 [claude] Añadir a cada fila de `CardDashboard` "Editar" (formulario en línea con la caducidad rellenada y número y CVV vacíos con la indicación "déjalo vacío para no cambiarlo", Guardar / Cancelar, una sola fila en edición a la vez, envía solo los campos cambiados) y "Eliminar" en dos pasos ("Confirmar" / "Cancelar") sin `window.confirm`; ante `404`, mostrar `Tarjeta no encontrada` y quitar la fila
- [ ] 4.5 [claude] Montar `CardDashboard` en `SessionView.jsx` para todos los usuarios y propagar `SessionExpiredError` a `onSessionExpired`; añadir estilos a `style.css` reutilizando las variables existentes y comprobar que se ve bien a 360 px de ancho
- [ ] 4.6 [claude] Verificar en el navegador todos los escenarios del cliente de la spec: sin tarjetas, lista del empleado de prueba, alta correcta, Luhn fallido sin petición (pestaña de red), error del servidor conservando número y caducidad y vaciando el CVV, editar solo la caducidad (la petición solo lleva esos dos campos), cancelar la edición sin petición, eliminar y cancelar, tarjeta borrada desde otra sesión, sesión caducada con `JWT_TTL_SECONDS=5`, y que el administrador no ve la tarjeta del empleado

## 5. Documentación y verificación final

- [ ] 5.1 [claude] Actualizar `README.md`: "Estado actual" (paso 5), "API" (`GET`, `POST`, `PATCH /:id` y `DELETE /:id` de `/api/private/cards` con cuerpos, códigos `400/403/404` y ejemplos con `curl` de alta, modificación y borrado) y "Vista de login" (el dashboard tras iniciar sesión); verificar que los comandos documentados funcionan
- [ ] 5.2 [claude] Añadir a `docs/primera-memoria/implementacion-y-seguridad.md` la sección "Dashboard de tarjetas (paso 5)": control de acceso por relación (`Tarjetas(u)`) y por propiedad para modificar y borrar, con la notación de `design.md` D2; flujo de cada endpoint; validación y Luhn; por qué `PATCH` parcial (D5) y cómo cambiará en la fase 1; enmascarado y qué datos nunca salen del servidor; límites (texto claro, CVV guardado, borrado físico); actualizar "Estructura del proyecto" y "Trabajo futuro"
- [ ] 5.3 [claude] Actualizar `docs/primera-memoria/manual-de-usuario.md`: "Qué ve el usuario" y "Rol de empleado" (dashboard, cómo dar de alta, modificar y eliminar una tarjeta, mensajes de error) y una nota en "Rol de gestor" (tiene su propio dashboard y no ve las tarjetas de los empleados)
- [ ] 5.4 [claude] Verificación de extremo a extremo: `npm install`, `npm run db:migrate` y `db:seed` en el servidor, `npm test --workspace=server` y `npm test --workspace=client`, `npm run dev`, recorrido como empleado y como administrador; ejecutar `openspec validate paso-5-dashboard-tarjetas --strict`
