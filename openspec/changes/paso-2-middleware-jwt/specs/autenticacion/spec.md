# Spec Delta

## Purpose

Ajusta la capacidad `autenticacion` que introduce `paso-1-login-texto-claro`:
el login, además de validar las credenciales, emite el token de sesión que
describe `sesion-jwt`, y la pantalla del cliente lo guarda para usarlo en la
sección privada de la API. Los requisitos no mencionados aquí (error genérico
ante credenciales incorrectas, validación de la petición) no cambian.

## MODIFIED Requirements

### Requirement: Endpoint público de login
El sistema SHALL exponer `POST /api/public/login`, accesible sin sesión, que
recibe un cuerpo JSON `{ "email", "password" }`. En este paso la contraseña
viaja y se compara en texto claro. Si las credenciales son válidas, el
servidor SHALL responder `200` con `{ "token", "user": { "email", "name",
"isAdmin" } }`, donde `token` es el token de sesión definido en `sesion-jwt`.

#### Scenario: Login correcto de un empleado
- **WHEN** se envía `POST /api/public/login` con el email y la contraseña de un usuario existente que no es administrador
- **THEN** el servidor responde `200` con `{ "token", "user": { "email", "name", "isAdmin": false } }`
- **AND** la respuesta no incluye la contraseña

#### Scenario: Login correcto de un administrador
- **WHEN** se envía `POST /api/public/login` con las credenciales de un usuario administrador
- **THEN** el servidor responde `200` con `user.isAdmin: true`

#### Scenario: El email no distingue mayúsculas
- **WHEN** se envía el email de un usuario existente con otras mayúsculas o con espacios al principio o al final, y su contraseña correcta
- **THEN** el servidor responde `200`

### Requirement: Login desde la pantalla del cliente
La pantalla de login del cliente SHALL enviar las credenciales a
`POST /api/public/login`, guardar en memoria el `token` recibido y mostrar la
vista de sesión con los datos del `user` devuelto. Ante un `401` SHALL mostrar
`Email o contraseña incorrectos.`, y ante cualquier otro fallo un mensaje de
error de conexión.

#### Scenario: Inicio de sesión desde la interfaz
- **WHEN** el usuario introduce credenciales válidas y pulsa entrar
- **THEN** el cliente guarda el token en memoria y muestra la vista de sesión con su email

#### Scenario: Credenciales incorrectas en la interfaz
- **WHEN** el usuario introduce credenciales incorrectas
- **THEN** el cliente muestra `Email o contraseña incorrectos.` y sigue en la pantalla de login

#### Scenario: Servidor no disponible
- **WHEN** el servidor no responde o devuelve un error distinto de `401`
- **THEN** el cliente muestra `No se ha podido iniciar sesión. Inténtalo de nuevo.`
