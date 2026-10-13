# Spec Delta

## Purpose

Permite que un usuario registrado se identifique ante el sistema con su email y
su contraseña, y define qué responde el servidor en cada caso.

## ADDED Requirements

### Requirement: Endpoint público de login
El sistema SHALL exponer `POST /api/public/login`, accesible sin sesión, que
recibe un cuerpo JSON `{ "email", "password" }`. En este paso la contraseña
viaja y se compara en texto claro.

#### Scenario: Login correcto de un empleado
- **WHEN** se envía `POST /api/public/login` con el email y la contraseña de un usuario existente que no es administrador
- **THEN** el servidor responde `200` con `{ "email", "name", "isAdmin": false }`
- **AND** la respuesta no incluye la contraseña

#### Scenario: Login correcto de un administrador
- **WHEN** se envía `POST /api/public/login` con las credenciales de un usuario administrador
- **THEN** el servidor responde `200` con `isAdmin: true`

#### Scenario: El email no distingue mayúsculas
- **WHEN** se envía el email de un usuario existente con otras mayúsculas o con espacios al principio o al final, y su contraseña correcta
- **THEN** el servidor responde `200`

### Requirement: Error genérico ante credenciales incorrectas
El sistema SHALL responder `401` con `{ "error": "Credenciales inválidas" }`
tanto si el email no existe como si la contraseña no coincide, sin revelar cuál
de los dos falla.

#### Scenario: Contraseña incorrecta
- **WHEN** se envía el email de un usuario existente con una contraseña distinta de la suya
- **THEN** el servidor responde `401` con `{ "error": "Credenciales inválidas" }`

#### Scenario: Email inexistente
- **WHEN** se envía un email que no pertenece a ningún usuario
- **THEN** el servidor responde `401` con el mismo cuerpo que ante una contraseña incorrecta

#### Scenario: La contraseña distingue mayúsculas
- **WHEN** se envía la contraseña correcta de un usuario con otras mayúsculas
- **THEN** el servidor responde `401`

### Requirement: Validación de la petición de login
El sistema SHALL rechazar con `400` y `{ "error": "Petición de login no válida" }`
cualquier petición cuyo cuerpo no sea un objeto JSON con `email` y `password`
de tipo texto y no vacíos, sin consultar a los usuarios.

#### Scenario: Falta un campo
- **WHEN** se envía `POST /api/public/login` sin el campo `password`
- **THEN** el servidor responde `400` con `{ "error": "Petición de login no válida" }`

#### Scenario: Campo vacío o de otro tipo
- **WHEN** se envía `email` como cadena vacía o `password` como número
- **THEN** el servidor responde `400`

#### Scenario: Campos demasiado largos
- **WHEN** `email` supera 254 caracteres o `password` supera 128
- **THEN** el servidor responde `400`

### Requirement: Login desde la pantalla del cliente
La pantalla de login del cliente SHALL enviar las credenciales a
`POST /api/public/login` y mostrar la vista de sesión con los datos devueltos.
Ante un `401` SHALL mostrar `Email o contraseña incorrectos.`, y ante cualquier
otro fallo un mensaje de error de conexión.

#### Scenario: Inicio de sesión desde la interfaz
- **WHEN** el usuario introduce credenciales válidas y pulsa entrar
- **THEN** el cliente muestra la vista de sesión con su email

#### Scenario: Credenciales incorrectas en la interfaz
- **WHEN** el usuario introduce credenciales incorrectas
- **THEN** el cliente muestra `Email o contraseña incorrectos.` y sigue en la pantalla de login

#### Scenario: Servidor no disponible
- **WHEN** el servidor no responde o devuelve un error distinto de `401`
- **THEN** el cliente muestra `No se ha podido iniciar sesión. Inténtalo de nuevo.`
