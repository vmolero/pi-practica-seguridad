# Spec Delta

Estos deltas se escriben sobre la versión de `administracion-usuarios` que
deja el cambio `claves-usuario-en-alta` (alta con `publicKey`,
`encryptedPrivateKey` y `privateKeyIv`, y formulario con confirmación de
contraseña).

## MODIFIED Requirements

### Requirement: Alta de usuarios
El sistema SHALL exponer `POST /api/private/admin/users`, que recibe
`{ "name", "email", "isAdmin", "loginKey", "publicKey", "encryptedPrivateKey", "privateKeyIv" }`
y crea el usuario con su par de claves y su clave de login. El email se SHALL
guardar sin espacios al principio ni al final y en minúsculas, e `isAdmin`
SHALL valer `false` si no se envía. Los tres campos de clave se SHALL guardar
tal y como llegan. `loginKey` SHALL guardarse según `clave-login`: una sal
nueva por usuario y `loginKeyHash = KDF(K_L ‖ pimienta, sal)`, nunca en claro.
Si todo es correcto, el servidor SHALL responder `201` con
`{ "id", "name", "email", "isAdmin" }`. El servidor SHALL NOT recibir ni
guardar la contraseña inicial.

#### Scenario: Alta correcta de un empleado
- **WHEN** un administrador envía `POST /api/private/admin/users` con `{ "name": "Ana Pérez", "email": " Ana@Empresa.com ", "loginKey": <K_L de "inicial123"> }` y campos de clave válidos
- **THEN** el servidor responde `201` con `email: "ana@empresa.com"` e `isAdmin: false`, sin `loginKey`, sin su hash ni su sal y sin los campos de clave
- **AND** el nuevo usuario puede iniciar sesión con `ana@empresa.com` y la `loginKey` derivada de `inicial123`

#### Scenario: Alta de otro administrador
- **WHEN** un administrador da de alta un usuario con `isAdmin: true`, una `loginKey` y campos de clave válidos
- **THEN** el servidor responde `201` con `isAdmin: true` y ese usuario puede acceder al panel

#### Scenario: Email repetido
- **WHEN** un administrador da de alta un usuario con un email que ya existe, aunque difiera en mayúsculas
- **THEN** el servidor responde `409` con `{ "error": "Ya existe un usuario con ese email" }` y no crea ningún usuario

### Requirement: Validación de los datos de usuario
El servidor SHALL rechazar con `400` y `{ "error": "Datos de usuario no válidos" }`
cualquier alta o modificación cuyo cuerpo no sea un objeto JSON válido o cuyos
campos no cumplan estas reglas, sin modificar la base de datos:
- `name`: texto de 1 a 100 caracteres tras quitar los espacios de los extremos.
- `email`: texto de hasta 254 caracteres con exactamente una `@` y texto a
  ambos lados.
- `loginKey`: obligatorio en el alta. Base64 que decodifica exactamente
  16 bytes.
- `isAdmin`: si se envía, booleano.
- `publicKey`: obligatorio en el alta. Base64 que el servidor puede leer como
  clave pública SPKI de tipo RSA con módulo de al menos 2048 bits.
- `privateKeyIv`: obligatorio en el alta. Base64 que decodifica exactamente
  16 bytes.
- `encryptedPrivateKey`: obligatorio en el alta. Base64 que decodifica entre
  16 y 4096 bytes, en un número múltiplo de 16.

El campo `password` SHALL NOT admitirse. En la modificación solo SHALL
admitirse el campo `name`.

#### Scenario: Falta un campo obligatorio en el alta
- **WHEN** un administrador envía un alta sin `loginKey`
- **THEN** el servidor responde `400` con `{ "error": "Datos de usuario no válidos" }`

#### Scenario: Alta con contraseña en claro
- **WHEN** un administrador envía un alta con el campo `password` como en los pasos anteriores
- **THEN** el servidor responde `400` y no crea ningún usuario

#### Scenario: Clave de login de longitud incorrecta
- **WHEN** un administrador envía un alta cuyo `loginKey` decodifica 15 bytes o no es base64
- **THEN** el servidor responde `400`

#### Scenario: Alta sin claves
- **WHEN** un administrador envía un alta con nombre, email y `loginKey` válidos pero sin `publicKey`, `encryptedPrivateKey` o `privateKeyIv`
- **THEN** el servidor responde `400` y no crea ningún usuario

#### Scenario: Clave pública no válida
- **WHEN** un administrador envía un alta cuyo `publicKey` no es una clave RSA SPKI o tiene un módulo de 1024 bits
- **THEN** el servidor responde `400` y no crea ningún usuario

#### Scenario: VI de longitud incorrecta
- **WHEN** un administrador envía un alta cuyo `privateKeyIv` decodifica 12 bytes
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

### Requirement: Panel de administración en el cliente
Tras iniciar sesión, el cliente SHALL mostrar a los administradores (y solo a
ellos) una sección "Usuarios" con:
- la tabla de usuarios (nombre, email y rol);
- un formulario de alta;
- la edición del nombre de cada fila;
- un botón de eliminar que pide confirmación en la propia interfaz, sin
  diálogos del navegador.

El formulario de alta SHALL pedir la contraseña dos veces y comprobar en el
cliente que coinciden y que tienen entre 8 y 128 caracteres. Solo entonces
SHALL derivar `K_L` con `derivarClaves(pw)`, generar el par de claves con el
módulo de claves del usuario y enviar el alta con `loginKey` y los campos de
clave, sin la contraseña; mientras tanto SHALL mostrar que la operación está en
curso. La contraseña inicial SHALL borrarse del formulario tras enviar.
Cada operación correcta SHALL reflejarse en la tabla sin recargar la página.
Cada error SHALL mostrarse en un área de alerta accesible con el mensaje que
devuelve el servidor. La fila del propio administrador NO SHALL ofrecer el
botón de eliminar.

#### Scenario: Un empleado no ve el panel
- **WHEN** un empleado inicia sesión
- **THEN** la vista de sesión no muestra la sección "Usuarios" ni hace ninguna petición a `/api/private/admin`

#### Scenario: Alta desde el panel
- **WHEN** un administrador rellena el formulario de alta con datos válidos y la misma contraseña en los dos campos, y lo envía
- **THEN** el cliente deriva `loginKey`, genera las claves, envía el alta sin la contraseña, el nuevo usuario aparece en la tabla y el formulario se vacía

#### Scenario: Contraseña demasiado corta
- **WHEN** un administrador escribe una contraseña inicial de 7 caracteres y envía el formulario
- **THEN** el panel muestra `La contraseña debe tener entre 8 y 128 caracteres`, no deriva claves y no envía ninguna petición

#### Scenario: Las contraseñas no coinciden
- **WHEN** un administrador escribe dos contraseñas distintas en el formulario de alta y lo envía
- **THEN** el panel muestra `Las contraseñas no coinciden`, no genera claves y no envía ninguna petición

#### Scenario: Error de email repetido en el panel
- **WHEN** un administrador da de alta un email que ya existe
- **THEN** el panel muestra `Ya existe un usuario con ese email` y conserva los datos del formulario salvo las contraseñas

#### Scenario: Renombrar desde el panel
- **WHEN** un administrador edita el nombre de una fila y confirma
- **THEN** la tabla muestra el nuevo nombre sin recargar la página

#### Scenario: Eliminar desde el panel
- **WHEN** un administrador pulsa eliminar en una fila y confirma en la interfaz
- **THEN** la fila desaparece de la tabla

#### Scenario: Sesión caducada durante una operación
- **WHEN** el token caduca y el administrador intenta una operación del panel
- **THEN** la interfaz vuelve a la pantalla de login con el aviso de sesión caducada

#### Scenario: Pierde el rol de administrador
- **WHEN** otro administrador elimina al administrador con la sesión iniciada y este intenta una operación del panel
- **THEN** el panel muestra `Acceso denegado`
