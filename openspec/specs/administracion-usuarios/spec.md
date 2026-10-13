# administracion-usuarios Specification

## Purpose

Permite que un administrador liste, dé de alta, renombre y elimine usuarios
desde un panel de la aplicación, y define el control de acceso por rol que
protege esas operaciones en el servidor.

## Requirements

### Requirement: Acceso restringido a administradores
Todas las rutas bajo `/api/private/admin` SHALL pasar primero por el
middleware de autenticación de la sección privada y después por una
comprobación de rol. La comprobación de rol SHALL exigir `isAdmin: true` en el
token **y** que el usuario del token siga existiendo en la base de datos con
`isAdmin` verdadero. Si alguna de las dos condiciones falla, el servidor SHALL
responder `403` con `{ "error": "Acceso denegado" }` sin ejecutar la operación.

#### Scenario: Petición sin token
- **WHEN** se envía `GET /api/private/admin/users` sin cabecera `Authorization`
- **THEN** el servidor responde `401` con `{ "error": "No autenticado" }`

#### Scenario: Empleado intenta acceder
- **WHEN** un empleado con un token válido envía `GET /api/private/admin/users`
- **THEN** el servidor responde `403` con `{ "error": "Acceso denegado" }`

#### Scenario: Empleado intenta crear un usuario
- **WHEN** un empleado con un token válido envía `POST /api/private/admin/users` con datos válidos
- **THEN** el servidor responde `403` y no crea ningún usuario

#### Scenario: Administrador eliminado con token aún válido
- **WHEN** un administrador ha sido eliminado por otro administrador y vuelve a llamar a `/api/private/admin/users` con su token sin caducar
- **THEN** el servidor responde `403`

### Requirement: Listado de usuarios
El sistema SHALL exponer `GET /api/private/admin/users`, que responde `200`
con `{ "users": [ { "id", "name", "email", "isAdmin" } ] }` ordenados por
`id` ascendente. La respuesta NO SHALL incluir la contraseña ni ningún otro
campo de la tabla `USER`.

#### Scenario: Administrador consulta la lista
- **WHEN** un administrador envía `GET /api/private/admin/users`
- **THEN** el servidor responde `200` con todos los usuarios, cada uno con exactamente `id`, `name`, `email` e `isAdmin`

### Requirement: Alta de usuarios
El sistema SHALL exponer `POST /api/private/admin/users`, que recibe
`{ "name", "email", "password", "isAdmin" }` y crea el usuario. El email se
SHALL guardar sin espacios al principio ni al final y en minúsculas, y
`isAdmin` SHALL valer `false` si no se envía. Si todo es correcto, el servidor
SHALL responder `201` con `{ "id", "name", "email", "isAdmin" }`. La
contraseña inicial se guarda en texto claro de forma provisional, igual que en
el login actual.

#### Scenario: Alta correcta de un empleado
- **WHEN** un administrador envía `POST /api/private/admin/users` con `{ "name": "Ana Pérez", "email": " Ana@Empresa.com ", "password": "inicial123" }`
- **THEN** el servidor responde `201` con `email: "ana@empresa.com"` e `isAdmin: false`, sin la contraseña
- **AND** el nuevo usuario puede iniciar sesión con `ana@empresa.com` e `inicial123`

#### Scenario: Alta de otro administrador
- **WHEN** un administrador da de alta un usuario con `isAdmin: true`
- **THEN** el servidor responde `201` con `isAdmin: true` y ese usuario puede acceder al panel

#### Scenario: Email repetido
- **WHEN** un administrador da de alta un usuario con un email que ya existe, aunque difiera en mayúsculas
- **THEN** el servidor responde `409` con `{ "error": "Ya existe un usuario con ese email" }` y no crea ningún usuario

### Requirement: Validación de los datos de usuario
El servidor SHALL rechazar con `400` y `{ "error": "Datos de usuario no válidos" }`
cualquier alta o modificación cuyo cuerpo no sea un objeto JSON válido o cuyos
campos no cumplan estas reglas, sin modificar la base de datos:
`name` texto de 1 a 100 caracteres tras quitar los espacios de los extremos;
`email` texto de hasta 254 caracteres con exactamente una `@` y texto a ambos
lados; `password` texto de 8 a 128 caracteres; `isAdmin`, si se envía,
booleano. En la modificación solo SHALL admitirse el campo `name`.

#### Scenario: Falta un campo obligatorio en el alta
- **WHEN** un administrador envía un alta sin `password`
- **THEN** el servidor responde `400` con `{ "error": "Datos de usuario no válidos" }`

#### Scenario: Contraseña demasiado corta
- **WHEN** un administrador envía un alta con una contraseña de 7 caracteres
- **THEN** el servidor responde `400`

#### Scenario: Email sin arroba
- **WHEN** un administrador envía un alta con `email: "ana.empresa.com"`
- **THEN** el servidor responde `400`

#### Scenario: Intento de cambiar algo más que el nombre
- **WHEN** un administrador envía `PATCH /api/private/admin/users/:id` con `{ "name": "Ana", "isAdmin": true }`
- **THEN** el servidor responde `400` y el usuario no cambia

#### Scenario: JSON ilegible
- **WHEN** un administrador envía un cuerpo que no es JSON válido
- **THEN** el servidor responde `400` con `{ "error": "Datos de usuario no válidos" }`

### Requirement: Modificación del nombre
El sistema SHALL exponer `PATCH /api/private/admin/users/:id`, que recibe
`{ "name" }`, guarda el nombre sin los espacios de los extremos y responde
`200` con `{ "id", "name", "email", "isAdmin" }` actualizados. Un `:id` que no
sea un entero positivo o que no corresponda a ningún usuario SHALL responder
`404` con `{ "error": "Usuario no encontrado" }`.

#### Scenario: Renombrar un empleado
- **WHEN** un administrador envía `PATCH /api/private/admin/users/2` con `{ "name": "  Ana García " }`
- **THEN** el servidor responde `200` con `name: "Ana García"` y la lista refleja el nuevo nombre

#### Scenario: Usuario inexistente
- **WHEN** un administrador renombra el usuario con id `9999`, que no existe
- **THEN** el servidor responde `404` con `{ "error": "Usuario no encontrado" }`

#### Scenario: Identificador no numérico
- **WHEN** un administrador envía `PATCH /api/private/admin/users/abc`
- **THEN** el servidor responde `404`

### Requirement: Eliminación de usuarios
El sistema SHALL exponer `DELETE /api/private/admin/users/:id`, que borra el
usuario y responde `204` sin cuerpo. Un administrador NO SHALL poder
eliminarse a sí mismo: en ese caso el servidor SHALL responder `400` con
`{ "error": "No puedes eliminar tu propia cuenta" }`. Como el que borra es
siempre un administrador distinto del borrado, siempre queda al menos un
administrador.

#### Scenario: Eliminar un empleado
- **WHEN** un administrador envía `DELETE /api/private/admin/users/:id` con el id de un empleado
- **THEN** el servidor responde `204`, el usuario desaparece de la lista y ya no puede iniciar sesión

#### Scenario: Autoeliminación
- **WHEN** un administrador intenta eliminar su propia cuenta
- **THEN** el servidor responde `400` con `{ "error": "No puedes eliminar tu propia cuenta" }` y la cuenta sigue existiendo

#### Scenario: Eliminar un usuario inexistente
- **WHEN** un administrador elimina un id que no existe
- **THEN** el servidor responde `404` con `{ "error": "Usuario no encontrado" }`

### Requirement: Panel de administración en el cliente
Tras iniciar sesión, el cliente SHALL mostrar a los administradores (y solo a
ellos) una sección "Usuarios" con la tabla de usuarios (nombre, email y rol),
un formulario de alta, la edición del nombre de cada fila y un botón de
eliminar que pide confirmación en la propia interfaz, sin diálogos del
navegador. Cada operación correcta SHALL reflejarse en la tabla sin recargar la
página, y cada error SHALL mostrarse en un área de alerta accesible con el
mensaje que devuelve el servidor. La fila del propio administrador NO SHALL
ofrecer el botón de eliminar.

#### Scenario: Un empleado no ve el panel
- **WHEN** un empleado inicia sesión
- **THEN** la vista de sesión no muestra la sección "Usuarios" ni hace ninguna petición a `/api/private/admin`

#### Scenario: Alta desde el panel
- **WHEN** un administrador rellena el formulario de alta con datos válidos y lo envía
- **THEN** el nuevo usuario aparece en la tabla y el formulario se vacía

#### Scenario: Error de email repetido en el panel
- **WHEN** un administrador da de alta un email que ya existe
- **THEN** el panel muestra `Ya existe un usuario con ese email` y conserva los datos del formulario salvo la contraseña

#### Scenario: Renombrar desde el panel
- **WHEN** un administrador edita el nombre de una fila y lo guarda
- **THEN** la fila muestra el nuevo nombre

#### Scenario: Eliminar desde el panel
- **WHEN** un administrador pulsa eliminar en una fila y confirma
- **THEN** la fila desaparece de la tabla
- **AND** si cancela, la fila sigue y no se envía ninguna petición

#### Scenario: Sesión caducada durante una operación
- **WHEN** el token caduca y el administrador intenta una operación del panel
- **THEN** el cliente vuelve a la pantalla de login con el aviso `Tu sesión ha caducado. Vuelve a iniciar sesión.`

#### Scenario: Pierde el rol de administrador
- **WHEN** el servidor responde `403` a una operación del panel
- **THEN** el panel muestra `No tienes permiso para gestionar usuarios.` y deja de ofrecer las acciones
