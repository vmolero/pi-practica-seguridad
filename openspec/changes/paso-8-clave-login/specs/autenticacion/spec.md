# Spec Delta

## MODIFIED Requirements

### Requirement: Endpoint público de login
El sistema SHALL exponer `POST /api/public/login`, accesible sin sesión, que
recibe un cuerpo JSON `{ "email", "loginKey" }`, donde `loginKey` es la clave
de login `K_L` definida en `clave-login`, en base64. La contraseña SHALL NOT
enviarse nunca al servidor. Si la clave de login es válida, el servidor SHALL
responder `200` con `{ "token", "user": { "email", "name", "isAdmin" } }`,
donde `token` es el token de sesión definido en `sesion-jwt`.

#### Scenario: Login correcto de un empleado
- **WHEN** se envía `POST /api/public/login` con el email de un usuario existente que no es administrador y la `loginKey` derivada de su contraseña
- **THEN** el servidor responde `200` con `{ "token", "user": { "email", "name", "isAdmin": false } }`
- **AND** la respuesta no incluye `loginKeyHash`, `loginKeySalt` ni ningún dato de la contraseña

#### Scenario: Login correcto de un administrador
- **WHEN** se envía `POST /api/public/login` con el email y la `loginKey` de un usuario administrador
- **THEN** el servidor responde `200` con `user.isAdmin: true`

#### Scenario: El email no distingue mayúsculas
- **WHEN** se envía el email de un usuario existente con otras mayúsculas o con espacios al principio o al final, y su `loginKey` correcta
- **THEN** el servidor responde `200`

### Requirement: Error genérico ante credenciales incorrectas
El sistema SHALL responder `401` con `{ "error": "Credenciales inválidas" }`
tanto si el email no existe como si la clave de login no coincide o el usuario
no tiene clave de login, sin revelar cuál de los casos se da y tardando un
tiempo similar en todos ellos.

#### Scenario: Clave de login incorrecta
- **WHEN** se envía el email de un usuario existente con una `loginKey` distinta de la suya
- **THEN** el servidor responde `401` con `{ "error": "Credenciales inválidas" }`

#### Scenario: Email inexistente
- **WHEN** se envía un email que no pertenece a ningún usuario
- **THEN** el servidor responde `401` con el mismo cuerpo que ante una clave de login incorrecta

#### Scenario: Usuario sin clave de login
- **WHEN** se envía el email de un usuario creado antes de este cambio, cuya fila tiene `loginKeyHash` a `NULL`
- **THEN** el servidor responde `401` con el mismo cuerpo

#### Scenario: La contraseña distingue mayúsculas
- **WHEN** el cliente deriva la `loginKey` de la contraseña correcta escrita con otras mayúsculas y la envía
- **THEN** el servidor responde `401`

### Requirement: Validación de la petición de login
El sistema SHALL rechazar con `400` y `{ "error": "Petición de login no válida" }`
cualquier petición cuyo cuerpo no sea un objeto JSON con `email` (texto no
vacío de hasta 254 caracteres) y `loginKey` (texto en base64 que decodifica
exactamente 16 bytes), sin consultar a los usuarios. Un cuerpo con el campo
`password` SHALL rechazarse igualmente.

#### Scenario: Falta un campo
- **WHEN** se envía `POST /api/public/login` sin el campo `loginKey`
- **THEN** el servidor responde `400` con `{ "error": "Petición de login no válida" }`

#### Scenario: Campo vacío o de otro tipo
- **WHEN** se envía `email` como cadena vacía o `loginKey` como número
- **THEN** el servidor responde `400`

#### Scenario: Clave de login de longitud incorrecta
- **WHEN** `loginKey` es base64 válido pero decodifica 15 o 17 bytes, o no es base64
- **THEN** el servidor responde `400`

#### Scenario: Cuerpo con contraseña
- **WHEN** se envía `{ "email", "password" }` como en los pasos anteriores
- **THEN** el servidor responde `400` y no consulta a los usuarios

#### Scenario: Campos demasiado largos
- **WHEN** `email` supera 254 caracteres
- **THEN** el servidor responde `400`

### Requirement: Login desde la pantalla del cliente
La pantalla de login del cliente SHALL derivar en el navegador `K_L` y `K_D`
de la contraseña con `derivarClaves(pw)`, enviar `{ "email", "loginKey" }` a
`POST /api/public/login`, guardar en memoria el `token` recibido y `K_D`, y
mostrar la vista de sesión con los datos del `user` devuelto. La contraseña
SHALL NOT enviarse ni guardarse. Ante un `401` SHALL mostrar
`Email o contraseña incorrectos.`, y ante cualquier otro fallo un mensaje de
error de conexión; en ambos casos SHALL descartar `K_D`. Al cerrar sesión o al
caducar la sesión SHALL descartar `K_D` junto con el token.

#### Scenario: Inicio de sesión desde la interfaz
- **WHEN** el usuario introduce credenciales válidas y pulsa entrar
- **THEN** el cliente envía `loginKey` sin la contraseña, guarda el token y `K_D` en memoria y muestra la vista de sesión con su email

#### Scenario: Credenciales incorrectas en la interfaz
- **WHEN** el usuario introduce credenciales incorrectas
- **THEN** el cliente muestra `Email o contraseña incorrectos.`, no conserva `K_D` y sigue en la pantalla de login

#### Scenario: Servidor no disponible
- **WHEN** el servidor no responde o devuelve un error distinto de `401`
- **THEN** el cliente muestra `No se ha podido iniciar sesión. Inténtalo de nuevo.`

#### Scenario: Nada persistido
- **WHEN** el usuario tiene la sesión iniciada
- **THEN** ni la contraseña, ni `K_L`, ni `K_D`, ni el token están en `localStorage`, `sessionStorage` ni cookies

#### Scenario: Cierre de sesión
- **WHEN** el usuario pulsa **Cerrar sesión** o el servidor responde `401` a una petición privada
- **THEN** el cliente descarta el token y `K_D` y muestra la pantalla de login
