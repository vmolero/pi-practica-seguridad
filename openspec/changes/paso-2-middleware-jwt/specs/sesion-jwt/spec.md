# Spec Delta

## Purpose

Define cómo el servidor emite un token de sesión (JWT) al iniciar sesión, cómo
viaja ese token en cada petición a la sección privada de la API, cómo se
verifica en el middleware de autenticación y qué recibe el cliente cuando el
token falta, es inválido o ha caducado.

## ADDED Requirements

### Requirement: Emisión del token de sesión
Al validar unas credenciales, el servidor SHALL emitir un JSON Web Token
(RFC 7519) firmado por el servidor cuyos *claims* son `sub` (id del usuario
como texto), `email`, `name`, `isAdmin` (booleano), `iss` (identificador fijo
de esta aplicación), `iat` y `exp`. El token SHALL caducar transcurrido el
tiempo de vida configurado, que por defecto es de 1 hora. El token SHALL NOT
contener la contraseña ni ningún otro dato del usuario.

#### Scenario: Token en la respuesta del login
- **WHEN** `POST /api/public/login` recibe credenciales válidas
- **THEN** la respuesta `200` incluye `token`, una cadena con tres partes separadas por `.`

#### Scenario: Contenido del token
- **WHEN** se decodifica la parte de *claims* del token de un usuario
- **THEN** contiene `sub`, `email`, `name`, `isAdmin`, `iss`, `iat` y `exp`, con `exp` igual a `iat` más el tiempo de vida configurado
- **AND** no contiene la contraseña

### Requirement: Transporte del token en la cabecera Authorization
El cliente SHALL enviar el token en cada petición a la sección privada en la
cabecera `Authorization` con el esquema `Bearer` (RFC 6750):
`Authorization: Bearer <token>`. El servidor SHALL aceptar el nombre del
esquema sin distinguir mayúsculas y SHALL rechazar cualquier otro esquema o
una cabecera sin token.

#### Scenario: Cabecera correcta
- **WHEN** se envía `GET /api/private/me` con `Authorization: Bearer <token válido>`
- **THEN** el servidor responde `200`

#### Scenario: Esquema en otras mayúsculas
- **WHEN** se envía la misma petición con `Authorization: bearer <token válido>`
- **THEN** el servidor responde `200`

#### Scenario: Sin cabecera
- **WHEN** se envía `GET /api/private/me` sin cabecera `Authorization`
- **THEN** el servidor responde `401`

#### Scenario: Otro esquema o cabecera incompleta
- **WHEN** se envía `Authorization: Basic xxx` o `Authorization: Bearer` sin token
- **THEN** el servidor responde `401`

### Requirement: Verificación de firma y caducidad
El middleware de autenticación SHALL verificar la firma del token con el
material de claves del servidor, SHALL comprobar que no ha caducado (`exp`
posterior al instante actual) y que `iss` es el de esta aplicación, y SHALL
admitir únicamente el algoritmo de firma configurado, rechazando `none` y
cualquier algoritmo indicado en la cabecera del token que no sea el esperado.
Cualquier fallo de verificación SHALL rechazar la petición sin ejecutar la
ruta.

#### Scenario: Token manipulado
- **WHEN** se modifica la parte de *claims* de un token válido (por ejemplo, para poner `isAdmin: true`) y se envía con la firma original
- **THEN** el servidor responde `401`

#### Scenario: Token firmado con otra clave
- **WHEN** se envía un token con la estructura correcta firmado con una clave distinta de la del servidor
- **THEN** el servidor responde `401`

#### Scenario: Token caducado
- **WHEN** se envía un token cuyo `exp` ya ha pasado
- **THEN** el servidor responde `401`

#### Scenario: Algoritmo no admitido
- **WHEN** se envía un token cuya cabecera declara `alg: none` o un algoritmo distinto del configurado
- **THEN** el servidor responde `401`

#### Scenario: Token ilegible
- **WHEN** se envía como token una cadena que no es un JWT (sin tres partes o con base64 inválido)
- **THEN** el servidor responde `401`

### Requirement: Usuario y rol en la petición
Cuando el token es válido, el middleware SHALL dejar en `request.user` un
objeto `{ id, email, name, isAdmin }` construido a partir de los *claims*, de
modo que las rutas privadas conozcan al usuario y su rol sin consultar el
token. Si los *claims* no tienen la forma esperada, el middleware SHALL
rechazar la petición como si el token fuera inválido.

#### Scenario: Empleado autenticado
- **WHEN** un empleado envía `GET /api/private/me` con su token
- **THEN** el servidor responde `200` con `{ "email", "name", "isAdmin": false }` y sin contraseña

#### Scenario: Administrador autenticado
- **WHEN** un administrador envía `GET /api/private/me` con su token
- **THEN** el servidor responde `200` con `isAdmin: true`

#### Scenario: Claims incompletos
- **WHEN** se envía un token con firma y caducidad válidas al que le falta `sub` o `email`
- **THEN** el servidor responde `401`

### Requirement: Sección privada de la API
Toda ruta bajo `/api/private` SHALL pasar por el middleware de autenticación
antes de cualquier otro tratamiento. Las rutas bajo `/api/public` y
`/api/health` SHALL seguir siendo accesibles sin token.

#### Scenario: Ruta privada inexistente sin token
- **WHEN** se envía `GET /api/private/no-existe` sin token
- **THEN** el servidor responde `401`, no `404`

#### Scenario: Ruta privada inexistente con token
- **WHEN** se envía `GET /api/private/no-existe` con un token válido
- **THEN** el servidor responde `404`

#### Scenario: Rutas públicas sin token
- **WHEN** se envía `GET /api/health` o `POST /api/public/login` sin cabecera `Authorization`
- **THEN** el servidor las atiende con normalidad

### Requirement: Respuesta 401 uniforme
Ante cualquier fallo de autenticación en la sección privada, el servidor SHALL
responder `401` con el cuerpo `{ "error": "No autenticado" }` y la cabecera
`WWW-Authenticate: Bearer`, sin indicar si el token faltaba, estaba mal
formado, tenía la firma incorrecta o había caducado.

#### Scenario: Mismo cuerpo para todas las causas
- **WHEN** se envían cuatro peticiones a `/api/private/me`: sin cabecera, con un token ilegible, con un token manipulado y con un token caducado
- **THEN** las cuatro respuestas tienen código `401`, el cuerpo `{ "error": "No autenticado" }` y la cabecera `WWW-Authenticate` con el valor `Bearer`

### Requirement: Contrato del servicio de tokens
La firma y la verificación del token SHALL estar detrás de un servicio con la
interfaz `sign(claims) → token` y `verify(token) → claims`, donde `verify`
lanza un error de token inválido ante cualquier fallo. Cualquier
implementación (la provisional de Claude o la definitiva del equipo) SHALL
superar la misma batería de tests de contrato: ida y vuelta de los *claims*,
rechazo de token manipulado, de firma ajena, de caducado, de algoritmo no
admitido y de cadena ilegible.

#### Scenario: Implementación provisional
- **WHEN** se ejecuta la batería de contrato contra la implementación provisional
- **THEN** todos los tests pasan

#### Scenario: Implementación del equipo
- **WHEN** el equipo sustituye la implementación provisional y se ejecuta la misma batería sin modificarla
- **THEN** todos los tests pasan y el resto de la aplicación no cambia

### Requirement: Uso del token en el cliente
El cliente SHALL guardar el token únicamente en memoria (nunca en
`localStorage`, `sessionStorage` ni cookies), SHALL enviarlo en la cabecera
`Authorization` de toda petición a `/api/private` y SHALL descartarlo al cerrar
sesión. Si una petición privada recibe `401`, el cliente SHALL descartar el
token y volver a la pantalla de login mostrando
`Tu sesión ha caducado. Vuelve a iniciar sesión.`

#### Scenario: Vista de sesión con datos del servidor
- **WHEN** el usuario inicia sesión correctamente
- **THEN** la vista de sesión muestra el nombre y el email devueltos por `GET /api/private/me`

#### Scenario: Token caducado durante la sesión
- **WHEN** el token caduca y el cliente hace una petición privada
- **THEN** la interfaz vuelve a la pantalla de login y muestra `Tu sesión ha caducado. Vuelve a iniciar sesión.`

#### Scenario: Recarga de la página
- **WHEN** el usuario recarga la página con la sesión iniciada
- **THEN** vuelve a aparecer la pantalla de login, porque el token no se ha persistido

#### Scenario: Cierre de sesión
- **WHEN** el usuario pulsa **Cerrar sesión**
- **THEN** el cliente descarta el token y muestra la pantalla de login sin aviso de caducidad
