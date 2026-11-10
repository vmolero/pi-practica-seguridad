# Spec Delta

Sobre la versión de `paso-8-clave-login`.

## MODIFIED Requirements

### Requirement: Endpoint público de login
El sistema SHALL exponer `POST /api/public/login`, accesible sin sesión, que
recibe un cuerpo JSON `{ "email", "loginKey" }`, donde `loginKey` es la clave
de login `K_L` definida en `clave-login`, en base64. La contraseña SHALL NOT
enviarse nunca al servidor. Si la clave de login es válida, el servidor SHALL
responder `200` con
`{ "token", "user": { "email", "name", "isAdmin" }, "keys": { "publicKey", "privateKeyIv", "encryptedPrivateKey" } }`,
donde `token` es el token de sesión definido en `sesion-jwt` y `keys` son los
tres valores guardados en `USER` para ese usuario, tal cual (base64). Si el
usuario no tiene claves guardadas, `keys` SHALL ser `null`.

#### Scenario: Login correcto de un empleado
- **WHEN** se envía `POST /api/public/login` con el email de un usuario existente que no es administrador y la `loginKey` derivada de su contraseña
- **THEN** el servidor responde `200` con `{ "token", "user": { "email", "name", "isAdmin": false }, "keys" }`
- **AND** `keys.publicKey`, `keys.privateKeyIv` y `keys.encryptedPrivateKey` son exactamente los valores de su fila en `USER`
- **AND** la respuesta no incluye `loginKeyHash`, `loginKeySalt` ni ningún dato de la contraseña

#### Scenario: Login correcto de un administrador
- **WHEN** se envía `POST /api/public/login` con el email y la `loginKey` de un usuario administrador
- **THEN** el servidor responde `200` con `user.isAdmin: true` y sus `keys`

#### Scenario: El email no distingue mayúsculas
- **WHEN** se envía el email de un usuario existente con otras mayúsculas o con espacios al principio o al final, y su `loginKey` correcta
- **THEN** el servidor responde `200`

#### Scenario: Usuario sin claves guardadas
- **WHEN** inicia sesión un usuario cuya fila tiene `publicKey`, `privateKeyIv` o `encryptedPrivateKey` a `NULL`
- **THEN** el servidor responde `200` con `keys: null`

#### Scenario: Las claves no se devuelven sin la clave de login correcta
- **WHEN** se envía una `loginKey` incorrecta para un usuario con claves guardadas
- **THEN** el servidor responde `401` y el cuerpo no contiene `keys`

### Requirement: Login desde la pantalla del cliente
La pantalla de login del cliente SHALL derivar en el navegador `K_L` y `K_D`
de la contraseña con `derivarClaves(pw)`, enviar `{ "email", "loginKey" }` a
`POST /api/public/login` y, con un `200`, abrir la clave privada del usuario:
`k_U = D_K_D(c_kU)` con `abrirClavePrivada`, comprobar con
`comprobarParDeClaves` que `k_U` corresponde a `K_U`, guardar en memoria el
`token`, `K_U` y `k_U`, borrar `K_D` y mostrar la vista de sesión con los
datos del `user` devuelto. La contraseña SHALL NOT enviarse ni guardarse. Si
`keys` es `null`, la apertura falla o la comprobación falla, el cliente SHALL
descartar el token y `K_D`, SHALL NOT mostrar la vista de sesión y SHALL
mostrar `No se ha podido abrir tu clave privada. Vuelve a intentarlo.`.
Ante un `401` SHALL mostrar `Email o contraseña incorrectos.`, y ante
cualquier otro fallo un mensaje de error de conexión; en ambos casos SHALL
descartar `K_D`. Al cerrar sesión o al caducar la sesión SHALL descartar el
token, `K_U` y `k_U`. La vista de sesión SHALL mostrar en «Tu cuenta» la fila
`Clave privada` con el valor `Abierta en este navegador`.

#### Scenario: Inicio de sesión desde la interfaz
- **WHEN** el usuario introduce credenciales válidas y pulsa entrar
- **THEN** el cliente envía `loginKey` sin la contraseña, abre `k_U` con `K_D`, guarda el token, `K_U` y `k_U` en memoria, borra `K_D` y muestra la vista de sesión con su email y la fila `Clave privada: Abierta en este navegador`

#### Scenario: Credenciales incorrectas en la interfaz
- **WHEN** el usuario introduce credenciales incorrectas
- **THEN** el cliente muestra `Email o contraseña incorrectos.`, no conserva `K_D` y sigue en la pantalla de login

#### Scenario: No se puede abrir la clave privada
- **WHEN** el servidor responde `200` pero `keys` es `null`, `encryptedPrivateKey` no se descifra con `K_D` o la clave obtenida no corresponde a `publicKey`
- **THEN** el cliente descarta el token y `K_D`, muestra `No se ha podido abrir tu clave privada. Vuelve a intentarlo.` y sigue en la pantalla de login

#### Scenario: Servidor no disponible
- **WHEN** el servidor no responde o devuelve un error distinto de `401`
- **THEN** el cliente muestra `No se ha podido iniciar sesión. Inténtalo de nuevo.`

#### Scenario: Nada persistido
- **WHEN** el usuario tiene la sesión iniciada
- **THEN** ni la contraseña, ni `K_L`, ni `K_D`, ni `k_U`, ni el token están en `localStorage`, `sessionStorage` ni cookies

#### Scenario: Cierre de sesión
- **WHEN** el usuario pulsa **Cerrar sesión** o el servidor responde `401` a una petición privada
- **THEN** el cliente descarta el token, `K_U` y `k_U` y muestra la pantalla de login
