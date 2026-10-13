# Diseño: paso 5 — dashboard de tarjetas del usuario

## Context

- Requisito previo: `paso-4-tabla-tarjetas`, que crea `CARD`, `USER_CARD` y
  `createCardRepository(knex)` con `listForUser`, `findForUser`,
  `createForOwner` y `removeOwnedBy`. El repositorio devuelve las tarjetas
  completas (incluido el CVV) y deja a la aplicación decidir qué se expone.
- Toda ruta bajo `/api/private` pasa por `createAuthMiddleware`, que deja en
  `request.user` `{ id, email, name, isAdmin }`.
- El servidor sigue capas (dominio, aplicación, infraestructura HTTP y base de
  datos) con inyección por fábricas en `createApp`, y validación de peticiones
  al estilo de `login-request.js` (devuelve el objeto normalizado o `null`).
- El cliente usa `apiFetch` (`401` → `SessionExpiredError`) y
  `SessionView.jsx` muestra los datos de la sesión. `paso-3` añade además un
  panel de administración solo para administradores.
- `fase-1-registro-y-cifrado/specs/boveda-tarjetas` describe la versión
  cifrada de esta funcionalidad (enmascarado `•••• 1234`, Luhn, 404 para
  tarjetas ajenas, editar y borrar las propias); este paso adopta esas reglas de interfaz para que la
  transición solo cambie el transporte y el almacenamiento.
- Sin primitivas criptográficas: todas las tareas son [claude].

## Goals / Non-Goals

**Goals:**

- Alta, listado, modificación y borrado de tarjetas propias, probados de
  extremo a extremo.
- Minimizar la exposición: el número completo y el CVV entran al servidor y
  no vuelven a salir por la API.
- Mismas reglas de validación en cliente y servidor.

**Non-Goals:**

- Ver el número completo o el CVV (lo recogerá la `boveda-tarjetas` de la
  fase 1 o un paso posterior).
- Compartir tarjetas, cifrado, paginación, detección de tarjetas duplicadas.

## Decisions

### D1. Rutas bajo `/api/private/cards`

`createCardsRouter({ cardService })` se monta dentro del router privado, igual
que el de administración del paso 3: hereda el `401` uniforme. `GET /`,
`POST /`, `PATCH /:id` y `DELETE /:id`. El usuario sale siempre de `request.user.id`, nunca del cuerpo ni de
la URL; por eso un campo `userId` en el cuerpo es un error de validación y no
algo que se ignore en silencio.

### D2. Control de acceso por relación, no por rol

`cardService.list(userId)` → `cardRepository.listForUser(userId)`. Como el
repositorio solo lee a través de `USER_CARD`, el conjunto visible es
`Tarjetas(u)` del paso 4, y ser administrador no lo amplía.

Para `PATCH` y `DELETE /:id`, `cardService` hace:

1. El router valida `:id` con `parseCardId(param)` de `card-request.js` (solo UUID); si no lo es → `404`, igual que una tarjeta inexistente.
2. `r = cardRepository.findForUser(id, userId)`; si `r` es `undefined` → `CardNotFoundError` (`404`).
3. Si `r.isOwner` es falso → `CardForbiddenError` (`403`).
4. `updateForOwner` / `removeForOwner`; si devuelven `undefined`/`false`
   (la tarjeta se borró entre medias) → `CardNotFoundError`.

Con notación: se permite modificar o borrar `c` sii
`∃r ∈ USER_CARD : r.userId = u ∧ r.cardId = c ∧ r.isOwner`. En la fase 1
toda relación es de propiedad, así que el paso 3 solo se alcanza con una
relación insertada a mano (escenario de la spec); el código queda listo para
la fase 2. El repositorio repite el filtro por propietario en la propia
consulta (D4 del paso 4), así que una carrera entre comprobación y escritura
no permite saltárselo.

Errores nuevos en `server/src/application/errors.js`:
`CardNotFoundError` → `404 { "error": "Tarjeta no encontrada" }` y
`CardForbiddenError` → `403 { "error": "Acceso denegado" }`.

### D3. Enmascarado en el dominio: `toMaskedCard(card)`

`server/src/domain/card.js` (creado en el paso 4) gana
`toMaskedCard(card)` → `{ id, last4, expiryMonth, expiryYear, createdAt }`,
con `last4 = number.slice(-4)`. Todo lo que devuelve `cardService` pasa por
ella, siguiendo el patrón de `toPublicUser` / `toAdminUser`. Así el CVV y el
número completo nunca llegan a la capa HTTP.

*Alternativa descartada:* seleccionar solo algunas columnas en el repositorio.
Acopla el repositorio a una vista concreta y el paso siguiente (ver la tarjeta
completa) necesitaría otro método igualmente.

### D4. Validación: `parseCreateCardRequest` y `parseUpdateCardRequest`

En `server/src/infrastructure/http/card-request.js`:

- Cuerpo objeto con exactamente las claves `number`, `expiryMonth`,
  `expiryYear`, `cvv`.
- `number`: texto ≤ 32 caracteres; se eliminan espacios y guiones; quedan
  `/^\d{13,19}$/` y Luhn.
- `expiryMonth`: entero 1–12. `expiryYear`: entero
  `año(now) ≤ y ≤ año(now) + 20`.
- Caducidad: válida sii `(y, m) ≥ (año(now), mes(now))` en comparación
  lexicográfica; una tarjeta vale hasta el último día de su mes.
- `cvv`: `/^\d{3,4}$/`. No se comprueba la longitud según la marca (Amex usa
  4): sería lógica de marca que no aporta a la práctica.

`parseUpdateCardRequest(body, { now })` aplica las mismas reglas a cada campo
presente, exige al menos uno, rechaza cualquier otra clave y exige
`expiryMonth` y `expiryYear` juntos (validar la caducidad necesita ambos, y
mezclar un campo nuevo con otro guardado complicaría la regla sin aportar
nada). Devuelve solo los campos enviados, normalizados.

`now` se inyecta para poder probar "caduca este mes" y "caducó el mes
pasado" sin depender del reloj. Devuelve
`{ number, expiryMonth, expiryYear, cvv }` normalizado o `null` → `400
{ "error": "Datos de tarjeta no válidos" }`. El mensaje es único para no dar
pistas sobre qué campo falló; el detalle por campo lo da el cliente.

### D5. Modificación parcial (`PATCH`) en lugar de sustitución (`PUT`)

El cliente nunca recibe el número completo ni el CVV (D3). Con un `PUT` que
sustituye los cuatro campos, cambiar la caducidad obligaría a volver a
teclear el número y el CVV, o bien a devolverlos al cliente, que es justo lo
que D3 evita. Con `PATCH` el formulario de edición rellena la caducidad, deja
el número y el CVV vacíos ("vacío = no cambiar") y envía solo lo que el
usuario ha tocado.

*Alternativa descartada:* `PUT` completo. Más simple en el servidor, pero
peor para el usuario y contrario a la minimización de D3.

En la fase 1 el servidor no podrá aplicar cambios parciales sobre datos
cifrados: el cliente descifrará, cambiará los campos y volverá a cifrar la
tarjeta entera con una clave nueva. La interfaz ("vacío = no cambiar") puede
seguir siendo la misma.

### D6. Luhn compartido entre cliente y servidor

La regla se implementa dos veces (servidor en `card-request.js`, cliente en
`client/src/validation/card.js`) porque cliente y servidor no comparten
paquete. Ambas versiones se prueban contra la misma tabla de casos (números de
prueba de Visa, Mastercard y Amex, y variaciones de un dígito). Esto no es
criptografía, así que es [claude].

### D7. Cliente

- `client/src/api/cards.js`: `listCards()`, `createCard(data)`,
  `updateCard(id, changes)` y `deleteCard(id)` sobre `apiFetch`; ante
  `400/403/404` lanza `Error` con el mensaje del servidor (con `404` marcado
  para que el dashboard quite la fila), ante otros fallos un mensaje genérico
  de conexión.
- `client/src/validation/card.js`: `validateCardForm(values, now, { partial })`
  (en modo parcial, los campos vacíos se ignoran y no se envían) devuelve
  errores por campo con los mensajes de la interfaz
  (`El número de tarjeta no es válido.`, `La tarjeta está caducada.`,
  `El CVV debe tener 3 o 4 dígitos.`, …).
- `client/src/components/CardDashboard.jsx`: lista (`<ul>` con
  `aria-label`), estado vacío, formulario con `<label>`, `inputMode="numeric"`,
  `autocomplete` de tarjeta y CVV con `type="password"`; área
  `role="alert"`. Tras cada envío, `cvv` vuelve a `''` en el estado.
  Cada fila tiene "Editar" (formulario en línea con la caducidad rellenada y
  número y CVV vacíos; Guardar / Cancelar; solo una fila en edición a la vez)
  y "Eliminar" en dos pasos ("Confirmar" / "Cancelar") sin `window.confirm`,
  igual que el panel del paso 3.
- `SessionView.jsx` monta `CardDashboard` para todos los usuarios, encima del
  panel de administración si existe; propaga `SessionExpiredError` a
  `onSessionExpired`.
- Nada de `console.log` con los datos, ni `localStorage`/`sessionStorage`.

### D8. Pruebas

- Unitarias de `card-request.js` (cada límite de D4, alta y modificación, con
  `now` fijo) y de `toMaskedCard`.
- Unitarias de `card-service.js` con un repositorio falso: lo devuelto nunca
  tiene `number` ni `cvv`; tarjeta ajena → `CardNotFoundError`; relación sin
  propiedad → `CardForbiddenError` sin llamar a `updateForOwner` ni
  `removeForOwner`.
- Integración `server/test/cards.test.js` con `startTestServer()`: cada
  escenario del lado del servidor de `specs/panel-tarjetas/spec.md`.

## Risks / Trade-offs

- [Número y CVV viajan y se guardan en claro] → PROVISIONAL, marcado en código
  y memoria, solo con datos de prueba; la fase 1 cifra en el navegador.
- [Guardar el CVV incumple PCI DSS] → Decisión consciente del proyecto (D9 del
  paso 4). Para limitar la exposición, el CVV entra por la API pero nunca sale
  (D3).
- [Borrado físico: una tarjeta borrada no se puede recuperar] → Confirmación
  en dos pasos en la interfaz; no hay papelera en esta fase.
- [Al editar, el usuario no ve el número actual] → Se muestra `•••• 1234` en
  la fila y el campo indica "déjalo vacío para no cambiarlo" (D5).
- [El nombre de la marca podría deducirse del número y no se muestra] → No es
  necesario para la práctica; `last4` basta para distinguir tarjetas.

## Migration Plan

Sin migraciones (las crea el paso 4). Despliegue: actualizar código y
reiniciar. Rollback: revertir el commit; las tarjetas creadas siguen en la
base de datos.

## Open Questions


Ninguna.
