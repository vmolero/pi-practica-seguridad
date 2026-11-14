# Spec Delta

Sobre la spec principal `panel-tarjetas`. El requisito «Acceso solo a las
tarjetas propias» y «Borrado de tarjetas» no cambian.

## MODIFIED Requirements

### Requirement: Listado de tarjetas enmascaradas
El sistema SHALL exponer `GET /api/private/cards`, que responde `200` con
`{ "cards": [ { "id", "number": { "iv", "ciphertext" }, "expiry": { "iv", "ciphertext" }, "cvv": { "iv", "ciphertext" }, "wrappedKey", "createdAt" } ] }`
ordenadas por fecha de alta ascendente, donde cada valor es el texto cifrado
guardado en `CARD` y `wrappedKey` la clave envuelta de la fila de `USER_CARD`
del usuario del token. La respuesta NO SHALL incluir ningún dato de la
tarjeta en claro ni `last4`, que el servidor ya no puede calcular.

#### Scenario: Usuario con una tarjeta
- **WHEN** el empleado de prueba envía `GET /api/private/cards`
- **THEN** el servidor responde `200` con su tarjeta, que tiene exactamente `id`, `number`, `expiry`, `cvv`, `wrappedKey` y `createdAt`, con los mismos valores que su fila en `CARD` y su `wrappedKey` en `USER_CARD`

#### Scenario: Usuario sin tarjetas
- **WHEN** un usuario sin tarjetas envía `GET /api/private/cards`
- **THEN** el servidor responde `200` con `{ "cards": [] }`

### Requirement: Alta de tarjetas
El sistema SHALL exponer `POST /api/private/cards`, que recibe
`{ "id", "number": { "iv", "ciphertext" }, "expiry": { "iv", "ciphertext" }, "cvv": { "iv", "ciphertext" }, "wrappedKey" }`
ya cifrado por el cliente, crea la tarjeta con ese `id` en minúsculas y con
el usuario del token como único propietario, guarda `wrappedKey` en su fila
de `USER_CARD` y responde `201` con la tarjeta en el mismo formato del
listado. Si ya existe una tarjeta con ese `id`, SHALL responder `409` con
`{ "error": "La tarjeta ya existe" }` sin cambiar nada.

#### Scenario: Alta correcta
- **WHEN** el empleado de prueba envía `POST /api/private/cards` con un cuerpo cifrado válido
- **THEN** el servidor responde `201` con `id`, los tres valores cifrados, `wrappedKey` y `createdAt`, iguales a los enviados
- **AND** el siguiente `GET /api/private/cards` incluye la nueva tarjeta

#### Scenario: La tarjeta queda solo para quien la da de alta
- **WHEN** el empleado de prueba da de alta una tarjeta
- **THEN** la tarjeta tiene una sola relación en `USER_CARD`, con el empleado como propietario y su `wrappedKey`, y no aparece en el listado de ningún otro usuario

#### Scenario: Identificador repetido
- **WHEN** se envía un alta con el `id` de una tarjeta que ya existe, aunque sea de otro usuario
- **THEN** el servidor responde `409` con `{ "error": "La tarjeta ya existe" }` y no crea ni cambia ninguna fila

### Requirement: Modificación de tarjetas
El sistema SHALL exponer `PATCH /api/private/cards/:id`, que recibe un
subconjunto no vacío de `{ "number", "expiry", "cvv" }`, cada uno como
`{ "iv", "ciphertext" }`, y sustituye solo esos valores. NO SHALL admitir
`id` ni `wrappedKey` en el cuerpo. Si todo es correcto, el servidor SHALL
actualizar la fecha de modificación y responder `200` con la tarjeta
completa en el formato del listado.

#### Scenario: Cambiar solo la caducidad
- **WHEN** el empleado de prueba envía `PATCH /api/private/cards/:id` sobre su tarjeta con `{ "expiry": { "iv", "ciphertext" } }` nuevos
- **THEN** el servidor responde `200` con el nuevo `expiry`, y `number`, `cvv` y `wrappedKey` iguales que antes

#### Scenario: Intento de cambiar la clave envuelta
- **WHEN** se envía `PATCH` con `{ "wrappedKey": "…" }`
- **THEN** el servidor responde `400` y la tarjeta no cambia

### Requirement: Validación de los datos de la tarjeta
El servidor SHALL rechazar con `400` y `{ "error": "Datos de tarjeta no válidos" }`
cualquier alta o modificación cuyo cuerpo no sea un objeto JSON válido, tenga
campos distintos de los admitidos o no cumpla estas reglas de estructura, sin
crear ni cambiar nada. En el alta SHALL ser obligatorios `id`, `number`,
`expiry`, `cvv` y `wrappedKey`; en la modificación SHALL enviarse al menos
uno de `number`, `expiry` y `cvv`, y ninguno de `id` ni `wrappedKey`. `id`
SHALL ser un UUID versión 4. Cada valor SHALL ser un objeto con exactamente
`iv` y `ciphertext`, ambos base64 válido, con `iv` de 12 bytes y
`ciphertext` de 35 bytes para `number`, 23 para `expiry` y 20 para `cvv`.
`wrappedKey` SHALL ser base64 válido de 256 bytes. El servidor NO SHALL
comprobar el contenido (Luhn, caducidad, CVV): esa validación la hace el
cliente antes de cifrar, con las reglas de `validation/card.js`.

#### Scenario: Cifrado de tamaño incorrecto
- **WHEN** se envía un alta cuyo `number.ciphertext` decodifica a 34 bytes
- **THEN** el servidor responde `400` con `{ "error": "Datos de tarjeta no válidos" }`

#### Scenario: Base64 ilegible
- **WHEN** se envía un alta con `wrappedKey: "no-es-base64!"`
- **THEN** el servidor responde `400`

#### Scenario: Identificador que no es UUID v4
- **WHEN** se envía un alta con `id: "123"`
- **THEN** el servidor responde `400` y no crea ninguna tarjeta

#### Scenario: Campo no admitido
- **WHEN** se envía un alta con un campo adicional `userId` o `last4`
- **THEN** el servidor responde `400` y no crea ninguna tarjeta

#### Scenario: Valor con campo de más
- **WHEN** se envía un alta en la que `cvv` tiene `iv`, `ciphertext` y `plain`
- **THEN** el servidor responde `400`

#### Scenario: Modificación vacía
- **WHEN** se envía `PATCH /api/private/cards/:id` con `{}`
- **THEN** el servidor responde `400` y la tarjeta no cambia

#### Scenario: JSON ilegible
- **WHEN** se envía un cuerpo que no es JSON válido
- **THEN** el servidor responde `400` con `{ "error": "Datos de tarjeta no válidos" }`

#### Scenario: Contenido no se valida en el servidor
- **WHEN** se envía un alta estructuralmente válida cuyo texto cifrado no corresponde a ninguna tarjeta real
- **THEN** el servidor responde `201`, porque no puede ni debe leer el contenido

### Requirement: Dashboard de tarjetas en el cliente
Tras iniciar sesión, el cliente SHALL mostrar a todos los usuarios una sección
"Mis tarjetas" con la lista de sus tarjetas, descifradas en el navegador con
la clave privada abierta en el login, cada una con el número en la forma
`•••• 1234` y la caducidad `MM/AA`, y un mensaje cuando no tenga ninguna.
Una tarjeta que no pueda descifrarse o cuya comprobación de integridad falle
SHALL mostrarse como `Tarjeta dañada: no se ha podido descifrar.`, sin ningún
dato y sin la acción «Editar», y NO SHALL impedir mostrar las demás. Cada
error de carga o de alta SHALL mostrarse en un área de alerta accesible con el
mensaje que devuelve el servidor, y una sesión caducada SHALL devolver al
usuario a la pantalla de login con el aviso habitual.

#### Scenario: Sin tarjetas
- **WHEN** un usuario sin tarjetas inicia sesión
- **THEN** el dashboard muestra `Todavía no has guardado ninguna tarjeta.`

#### Scenario: Lista de tarjetas
- **WHEN** el empleado de prueba inicia sesión
- **THEN** el dashboard muestra su tarjeta como `•••• 1111` con `12/30`, sin el número completo ni el CVV

#### Scenario: Tarjeta dañada
- **WHEN** en la base de datos se altera el `numberCiphertext` de una de las dos tarjetas del empleado
- **THEN** el dashboard muestra esa tarjeta como `Tarjeta dañada: no se ha podido descifrar.` con solo la acción «Eliminar», y la otra tarjeta con normalidad

#### Scenario: Sesión caducada
- **WHEN** el token caduca y el usuario intenta dar de alta una tarjeta
- **THEN** el cliente vuelve a la pantalla de login con el aviso `Tu sesión ha caducado. Vuelve a iniciar sesión.`

### Requirement: Formulario de alta de tarjetas
El dashboard SHALL ofrecer un formulario de alta con los campos número,
caducidad (mes y año) y CVV, con `<label>` visibles y los atributos
`autocomplete` `cc-number`, `cc-exp-month`, `cc-exp-year` y `cc-csc`. El
cliente SHALL validar los datos con las reglas de `validation/card.js`
(Luhn, caducidad no vencida y no más de 20 años, CVV de 3 o 4 dígitos) y
mostrar el error junto al campo sin enviar la petición; es la única
validación de contenido del sistema. Tras validar, SHALL generar el `id`,
cifrar los valores y envolver la clave según `cifrado-tarjetas`, y enviar
solo texto cifrado. Tras un alta correcta, la nueva tarjeta SHALL aparecer
en la lista sin recargar y el formulario SHALL vaciarse. Tras cualquier
envío, correcto o no, el CVV SHALL borrarse del formulario. Los datos de la
tarjeta NO SHALL escribirse en la consola ni guardarse en el almacenamiento
del navegador.

#### Scenario: Alta desde el dashboard
- **WHEN** el usuario rellena el formulario con datos válidos y lo envía
- **THEN** la petición contiene solo `id`, valores cifrados y `wrappedKey`, la tarjeta aparece en la lista enmascarada y el formulario queda vacío

#### Scenario: Número inválido en el cliente
- **WHEN** el usuario escribe un número que no supera la comprobación de Luhn y envía
- **THEN** el formulario muestra `El número de tarjeta no es válido.` junto al campo y no se hace ninguna petición

#### Scenario: Error del servidor
- **WHEN** el servidor rechaza el alta
- **THEN** el dashboard muestra el mensaje del servidor, conserva el número y la caducidad y vacía el CVV

### Requirement: Edición y borrado en el dashboard
Cada tarjeta legible de la lista SHALL ofrecer "Editar" y "Eliminar"; una
tarjeta dañada solo "Eliminar". "Editar" SHALL abrir en la propia fila un
formulario con la caducidad rellenada y el número y el CVV vacíos, donde
dejar un campo vacío significa no cambiarlo, con "Guardar" y "Cancelar". El
cliente SHALL validar los campos rellenados con las reglas de
`validation/card.js`, recuperar la clave de la tarjeta con su clave privada,
cifrar solo esos campos con vectores nuevos y enviarlos. "Eliminar" SHALL
pedir confirmación en la propia fila ("Confirmar" / "Cancelar") sin diálogos
del navegador. Cada operación correcta SHALL reflejarse en la lista sin
recargar, y cada error SHALL mostrarse en el área de alerta.

#### Scenario: Editar la caducidad desde el dashboard
- **WHEN** el usuario pulsa "Editar", cambia solo la caducidad y guarda
- **THEN** la petición solo incluye `expiry` cifrado, y la fila muestra la nueva caducidad

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
