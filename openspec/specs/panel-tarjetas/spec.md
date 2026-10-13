# panel-tarjetas Specification

## Purpose

Permite que cada usuario con sesión dé de alta, liste, modifique y elimine sus
tarjetas (número, fecha de caducidad y CVV), sin exponer nunca el número
completo ni el CVV después de guardarlos.

## Requirements

### Requirement: Acceso solo a las tarjetas propias
Todas las rutas bajo `/api/private/cards` SHALL pasar por el middleware de
autenticación de la sección privada y operar únicamente sobre las tarjetas
relacionadas con el usuario del token en `USER_CARD`. Ser administrador NO
SHALL dar acceso a las tarjetas de otros usuarios. Un `:id` que no sea un UUID
o que corresponda a una tarjeta no relacionada con el usuario SHALL responder
`404` con `{ "error": "Tarjeta no encontrada" }`, sin distinguir si existe.
Modificar o borrar SHALL exigir además que el usuario sea el propietario
(`isOwner = true`); si está relacionado pero no es el propietario, el servidor
SHALL responder `403` con `{ "error": "Acceso denegado" }` sin cambiar nada.

#### Scenario: Petición sin token
- **WHEN** se envía `GET /api/private/cards` sin cabecera `Authorization`
- **THEN** el servidor responde `401` con `{ "error": "No autenticado" }`

#### Scenario: El administrador no ve las tarjetas de los empleados
- **WHEN** el administrador de prueba envía `GET /api/private/cards` y el empleado de prueba tiene una tarjeta
- **THEN** la respuesta no incluye la tarjeta del empleado

#### Scenario: Modificar o borrar la tarjeta de otro usuario
- **WHEN** el administrador de prueba envía `PATCH` o `DELETE /api/private/cards/:id` con el id de la tarjeta del empleado
- **THEN** el servidor responde `404` con `{ "error": "Tarjeta no encontrada" }` y la tarjeta no cambia

#### Scenario: Identificador que no es un UUID
- **WHEN** un usuario envía `DELETE /api/private/cards/123`
- **THEN** el servidor responde `404`

#### Scenario: Usuario relacionado que no es propietario
- **WHEN** existe en `USER_CARD` una relación con `isOwner = false` entre un usuario y una tarjeta (insertada directamente en la base de datos, como en la fase 2) y ese usuario envía `PATCH` o `DELETE` sobre ella
- **THEN** el servidor responde `403` con `{ "error": "Acceso denegado" }` y la tarjeta no cambia

### Requirement: Listado de tarjetas enmascaradas
El sistema SHALL exponer `GET /api/private/cards`, que responde `200` con
`{ "cards": [ { "id", "last4", "expiryMonth", "expiryYear", "createdAt" } ] }`
ordenadas por fecha de alta ascendente. La respuesta NO SHALL incluir el
número completo, el CVV ni ningún otro campo de la tarjeta.

#### Scenario: Usuario con una tarjeta
- **WHEN** el empleado de prueba envía `GET /api/private/cards`
- **THEN** el servidor responde `200` con su tarjeta, que tiene exactamente `id`, `last4`, `expiryMonth`, `expiryYear` y `createdAt`

#### Scenario: Usuario sin tarjetas
- **WHEN** un usuario sin tarjetas envía `GET /api/private/cards`
- **THEN** el servidor responde `200` con `{ "cards": [] }`

### Requirement: Alta de tarjetas
El sistema SHALL exponer `POST /api/private/cards`, que recibe
`{ "number", "expiryMonth", "expiryYear", "cvv" }`, guarda el número sin
espacios ni guiones, crea la tarjeta con el usuario del token como único
propietario y responde `201` con la tarjeta en el mismo formato enmascarado
del listado.

#### Scenario: Alta correcta
- **WHEN** el empleado de prueba envía `POST /api/private/cards` con `{ "number": "4111 1111 1111 1111", "expiryMonth": 12, "expiryYear": 2030, "cvv": "123" }`
- **THEN** el servidor responde `201` con `last4: "1111"`, `expiryMonth: 12` y `expiryYear: 2030`, sin `number` ni `cvv`
- **AND** el siguiente `GET /api/private/cards` incluye la nueva tarjeta

#### Scenario: La tarjeta queda solo para quien la da de alta
- **WHEN** el empleado de prueba da de alta una tarjeta
- **THEN** la tarjeta tiene una sola relación en `USER_CARD`, con el empleado como propietario, y no aparece en el listado de ningún otro usuario

### Requirement: Modificación de tarjetas
El sistema SHALL exponer `PATCH /api/private/cards/:id`, que recibe un
subconjunto no vacío de `{ "number", "expiryMonth", "expiryYear", "cvv" }` y
modifica solo esos campos. `expiryMonth` y `expiryYear` SHALL enviarse juntos.
Si todo es correcto, el servidor SHALL actualizar la fecha de modificación y
responder `200` con la tarjeta en el formato enmascarado del listado.

#### Scenario: Cambiar solo la caducidad
- **WHEN** el empleado de prueba envía `PATCH /api/private/cards/:id` sobre su tarjeta con `{ "expiryMonth": 6, "expiryYear": 2031 }`
- **THEN** el servidor responde `200` con `expiryMonth: 6`, `expiryYear: 2031` y el mismo `last4`, y el número y el CVV guardados no cambian

#### Scenario: Cambiar el número
- **WHEN** el empleado de prueba envía `PATCH` sobre su tarjeta con `{ "number": "5555 5555 5555 4444" }`
- **THEN** el servidor responde `200` con `last4: "4444"`

### Requirement: Borrado de tarjetas
El sistema SHALL exponer `DELETE /api/private/cards/:id`, que elimina la
tarjeta y todas sus relaciones y responde `204` sin cuerpo.

#### Scenario: Borrar una tarjeta propia
- **WHEN** el empleado de prueba envía `DELETE /api/private/cards/:id` sobre su tarjeta
- **THEN** el servidor responde `204`, la tarjeta ya no aparece en su listado y no queda ninguna fila suya en `USER_CARD`

#### Scenario: Borrar dos veces
- **WHEN** el empleado de prueba borra una tarjeta que ya había borrado
- **THEN** el servidor responde `404`

### Requirement: Validación de los datos de la tarjeta
El servidor SHALL rechazar con `400` y `{ "error": "Datos de tarjeta no válidos" }`
cualquier alta o modificación cuyo cuerpo no sea un objeto JSON válido, tenga
campos distintos de los cuatro admitidos o no cumpla estas reglas, sin crear
ni cambiar nada. En el alta los cuatro campos SHALL ser obligatorios; en la
modificación SHALL enviarse al menos uno, y `expiryMonth` y `expiryYear`
juntos. Cada campo enviado SHALL cumplir:
`number` texto que, quitando espacios y guiones, tenga de 13 a 19 dígitos y
supere la comprobación de Luhn; `expiryMonth` entero de 1 a 12;
`expiryYear` entero de cuatro cifras, no más de 20 años después del actual;
la caducidad (último día del mes indicado) no SHALL ser anterior al mes
actual; `cvv` texto de 3 o 4 dígitos.

#### Scenario: Número que no supera Luhn
- **WHEN** se envía un alta con `number: "4111111111111112"`
- **THEN** el servidor responde `400` con `{ "error": "Datos de tarjeta no válidos" }`

#### Scenario: Tarjeta caducada
- **WHEN** se envía un alta cuya caducidad es el mes anterior al actual
- **THEN** el servidor responde `400`

#### Scenario: Tarjeta que caduca este mes
- **WHEN** se envía un alta cuya caducidad es el mes actual
- **THEN** el servidor responde `201`

#### Scenario: CVV con letras
- **WHEN** se envía un alta con `cvv: "12a"`
- **THEN** el servidor responde `400`

#### Scenario: Campo no admitido
- **WHEN** se envía un alta con un campo adicional `userId`
- **THEN** el servidor responde `400` y no crea ninguna tarjeta

#### Scenario: Modificación vacía
- **WHEN** se envía `PATCH /api/private/cards/:id` con `{}`
- **THEN** el servidor responde `400` y la tarjeta no cambia

#### Scenario: Mes de caducidad sin año
- **WHEN** se envía una modificación con `{ "expiryMonth": 3 }`
- **THEN** el servidor responde `400`

#### Scenario: JSON ilegible
- **WHEN** se envía un cuerpo que no es JSON válido
- **THEN** el servidor responde `400` con `{ "error": "Datos de tarjeta no válidos" }`

### Requirement: Dashboard de tarjetas en el cliente
Tras iniciar sesión, el cliente SHALL mostrar a todos los usuarios una sección
"Mis tarjetas" con la lista de sus tarjetas, cada una con el número en la
forma `•••• 1234` y la caducidad `MM/AA`, y un mensaje cuando no tenga
ninguna. Cada error de carga o de alta SHALL mostrarse en un área de alerta
accesible con el mensaje que devuelve el servidor, y una sesión caducada SHALL
devolver al usuario a la pantalla de login con el aviso habitual.

#### Scenario: Sin tarjetas
- **WHEN** un usuario sin tarjetas inicia sesión
- **THEN** el dashboard muestra `Todavía no has guardado ninguna tarjeta.`

#### Scenario: Lista de tarjetas
- **WHEN** el empleado de prueba inicia sesión
- **THEN** el dashboard muestra su tarjeta como `•••• 1111` con su caducidad, sin el número completo ni el CVV

#### Scenario: Sesión caducada
- **WHEN** el token caduca y el usuario intenta dar de alta una tarjeta
- **THEN** el cliente vuelve a la pantalla de login con el aviso `Tu sesión ha caducado. Vuelve a iniciar sesión.`

### Requirement: Formulario de alta de tarjetas
El dashboard SHALL ofrecer un formulario de alta con los campos número,
caducidad (mes y año) y CVV, con `<label>` visibles y los atributos
`autocomplete` `cc-number`, `cc-exp-month`, `cc-exp-year` y `cc-csc`. El
cliente SHALL validar los datos con las mismas reglas que el servidor y
mostrar el error junto al campo sin enviar la petición. Tras un alta
correcta, la nueva tarjeta SHALL aparecer en la lista sin recargar y el
formulario SHALL vaciarse. Tras cualquier envío, correcto o no, el CVV SHALL
borrarse del formulario. Los datos de la tarjeta NO SHALL escribirse en la
consola ni guardarse en el almacenamiento del navegador.

#### Scenario: Alta desde el dashboard
- **WHEN** el usuario rellena el formulario con datos válidos y lo envía
- **THEN** la tarjeta aparece en la lista enmascarada y el formulario queda vacío

#### Scenario: Número inválido en el cliente
- **WHEN** el usuario escribe un número que no supera la comprobación de Luhn y envía
- **THEN** el formulario muestra `El número de tarjeta no es válido.` junto al campo y no se hace ninguna petición

#### Scenario: Error del servidor
- **WHEN** el servidor rechaza el alta
- **THEN** el dashboard muestra el mensaje del servidor, conserva el número y la caducidad y vacía el CVV

### Requirement: Edición y borrado en el dashboard
Cada tarjeta de la lista SHALL ofrecer "Editar" y "Eliminar". "Editar" SHALL
abrir en la propia fila un formulario con la caducidad rellenada y el número y
el CVV vacíos, donde dejar un campo vacío significa no cambiarlo, con
"Guardar" y "Cancelar". El cliente SHALL validar los campos rellenados con las
mismas reglas que el servidor y enviar solo esos campos. "Eliminar" SHALL
pedir confirmación en la propia fila ("Confirmar" / "Cancelar") sin diálogos
del navegador. Cada operación correcta SHALL reflejarse en la lista sin
recargar, y cada error SHALL mostrarse en el área de alerta.

#### Scenario: Editar la caducidad desde el dashboard
- **WHEN** el usuario pulsa "Editar", cambia solo la caducidad y guarda
- **THEN** la petición solo incluye `expiryMonth` y `expiryYear`, y la fila muestra la nueva caducidad

#### Scenario: Cancelar la edición
- **WHEN** el usuario pulsa "Editar" y después "Cancelar"
- **THEN** la fila vuelve a su estado anterior y no se envía ninguna petición

#### Scenario: Eliminar desde el dashboard
- **WHEN** el usuario pulsa "Eliminar" en una tarjeta y confirma
- **THEN** la tarjeta desaparece de la lista
- **AND** si cancela, la tarjeta sigue y no se envía ninguna petición

#### Scenario: Tarjeta borrada desde otra sesión
- **WHEN** el usuario intenta editar o eliminar una tarjeta que ya no existe
- **THEN** el dashboard muestra `Tarjeta no encontrada` y la quita de la lista
