# Propuesta: abrir la clave privada del usuario en el login

## Why

Desde el paso 8 el navegador conserva `K_D` en memoria durante la sesión,
pero no la usa para nada: el servidor no devuelve `c_kU` ni `VI` en el login
y el cliente nunca abre la clave privada `k_U`. Sin `k_U` en el navegador no
se puede empezar a cifrar las tarjetas, que es lo que exige el enunciado
(AES con claves aleatorias gestionadas con las claves asimétricas de cada
usuario). `docs/diagrama-secuencia-login.md` ya describe la segunda mitad del
login: el servidor devuelve `K_U`, `VI` y `c_kU` junto con el token, y el
navegador recupera `k_U = D_K_D(c_kU)`, comprueba que corresponde a `K_U` y
borra `K_D`. Este cambio implanta esa parte y deja el par de claves listo en
el navegador para el siguiente paso.

## What Changes

- **El login devuelve el material de claves del usuario.** `POST /api/public/login`
  responde `200` con `{ "token", "user", "keys": { "publicKey", "privateKeyIv", "encryptedPrivateKey" } }`,
  tal y como están guardados en `USER` (base64). El servidor no puede abrir
  `c_kU` porque no conoce `K_D`; devolverlo no le da ninguna información
  nueva al cliente legítimo y nada al atacante que no tenga la contraseña.
- **El navegador abre la clave privada.** Tras un `200`, `auth.js` llama a
  `abrirClavePrivada` con `K_D` (ya existe en `claves-usuario.js` desde el
  paso 7), comprueba que la clave privada obtenida corresponde a la pública
  (cifra un valor aleatorio con `K_U` y lo descifra con `k_U`) y guarda en
  memoria `K_U` y `k_U` como `CryptoKey` no exportables. Después borra `K_D`.
- **Fallo al abrir la clave.** Si faltan las claves en la respuesta, si
  `c_kU` no se abre con `K_D` o si `k_U` no corresponde a `K_U`, el cliente
  descarta el token y `K_D`, no entra en la sesión y muestra
  `No se ha podido abrir tu clave privada. Vuelve a intentarlo.`
- **Estado visible en la vista de sesión.** La tarjeta «Tu cuenta» muestra la
  fila «Clave privada: abierta en este navegador», para que se pueda comprobar
  a simple vista que el paso ha funcionado.
- **Cierre de sesión y caducidad.** `clearSession()` descarta también `K_U` y
  `k_U`. Al recargar la página se pierden, como el token: hay que volver a
  iniciar sesión.
- **Comprobación del par de claves en el módulo de seguridad.**
  `claves-usuario.js` incorpora `comprobarParDeClaves(K_U, k_U)` (RSA-OAEP de
  Web Crypto), con su prueba de contrato.

**Qué queda igual.** La derivación `derivarClaves`, el servicio de clave de
login, el alta, la semilla, el token JWT y la sección privada no cambian. El
esquema de `USER` no cambia: no hay migración.

**Supuesto sobre dónde viajan las claves.** El diagrama de login las pone en
la respuesta de `POST /api/public/login`, y así se hace aquí. La alternativa
(un `GET /api/private/me/keys` con el token) se descarta en `design.md`.

**Fuera de alcance:**
- cifrar las tarjetas con una clave AES por tarjeta envuelta con `K_U`
  (siguiente cambio, `docs/diagrama-secuencia-crear-tarjeta.md`);
- el cambio de contraseña (recifrar `c_kU` y recalcular `h_L`);
- el reto-respuesta firmado con `k_U`, el doble factor y la limitación de
  intentos;
- proteger la integridad de `c_kU` con AES-GCM o un MAC (ver `design.md`).

**Requisito previo.** `claves-usuario-en-alta` y `paso-8-clave-login`
implementados (lo están desde los commits `bbf2bfd` y `f2a9a81`). Los deltas
de `autenticacion` y `claves-usuario` se escriben sobre la versión de esos
dos cambios, todavía sin archivar.

**Reparto.** La apertura de `c_kU` y la comprobación del par son operaciones
del módulo de seguridad del cliente, que ya tiene una implementación
provisional con Web Crypto (RSA-OAEP y AES-CBC son los definitivos; solo `H`
es provisional). Este cambio es todo [claude], salvo la revisión final del
equipo.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `autenticacion` (sobre la versión de `paso-8-clave-login`): cambian dos
  requisitos:
  - el endpoint público de login incluye `keys` en la respuesta `200`;
  - la pantalla de login abre la clave privada con `K_D`, guarda `K_U` y
    `k_U` en memoria, borra `K_D`, y trata el fallo de apertura como un
    error que no inicia la sesión.
- `claves-usuario` (sobre la versión de `claves-usuario-en-alta`): cambian
  dos requisitos y se añade uno:
  - «La clave privada cifrada no sale del servidor por la API de
    administración» pasa a permitir que `POST /api/public/login` devuelva
    los tres campos al usuario autenticado, y sigue prohibiéndolos en
    `/api/private/admin/users`;
  - «Generación del par de claves en el navegador» añade la comprobación de
    que una clave privada corresponde a una pública;
  - nuevo requisito: las claves abiertas viven solo en memoria, como
    `CryptoKey` no exportables, y se destruyen al cerrar sesión.

## Impact

- **Servidor:**
  - `server/src/infrastructure/database/user-repository.js`: `findByEmail`
    devuelve también `publicKey`, `encryptedPrivateKey` y `privateKeyIv`;
  - `server/src/application/auth-service.js`: `login` devuelve
    `{ token, user, keys }`;
  - tests: `user-repository`, `auth-service`, `public-login` (la respuesta
    trae las claves de la fila y sigue sin traer sal ni hash), `admin-users`
    (las respuestas de administración siguen sin claves).
- **Cliente:**
  - `client/src/security/claves-usuario.js`: `comprobarParDeClaves` y su
    prueba en `claves-usuario.test.js`;
  - `client/src/api/session.js`: `setUserKeys`, `getUserKeys`,
    `clearSession` también las borra;
  - `client/src/api/auth.js`: abre la clave tras el `200`, nuevo mensaje de
    error;
  - `client/src/components/SessionView.jsx`: fila de estado de la clave
    privada.
- **Scripts y semilla:** sin cambios. `scripts/generar-claves-usuario.mjs`
  sirve para crear usuarios cuya clave se abre.
- **Dependencias:** ninguna nueva.
- **Documentación afectada:**
  - `README.md`: «Estado actual» / «Seguridad», «Vista de login» (abre
    `k_U`, qué guarda en memoria), «API» (respuesta de login con `keys`).
  - `docs/primera-memoria/implementacion-y-seguridad.md`: sección nueva
    «Apertura de la clave privada en el login (paso 9)» con flujo, quién
    conoce cada dato y «Lo que este paso no protege»; actualizar «Flujo de
    `POST /api/public/login`», «Lo que este paso no protege» de los pasos 7 y
    8 y «Trabajo futuro».
  - `docs/primera-memoria/manual-de-usuario.md`: «Iniciar sesión» (mensaje
    de error nuevo, fila de estado).
  - `docs/criptografia-implementada.md`: tabla «Dónde está el código», pasos
    del login, ejemplo (apertura y comprobación del par) y tabla de
    pendientes.
  - `docs/diagrama-secuencia-login.md`: «Estado» pasa a implantado.
  - `docs/primera-memoria/stack-tecnologico.md`: sin librerías nuevas; nota
    de que RSA-OAEP de Web Crypto ya se usa en el login.
