# Propuesta: clave de login derivada de la contraseña, con sal y pimienta

## Why

Hoy la contraseña viaja al servidor y se guarda y compara en texto claro
(`auth-service.js`, `user-admin-service.js`). Quien lea `app.sqlite` obtiene
todas las contraseñas, y el servidor conoce `pw` y por tanto podría recalcular
la clave de datos `K_D` que protege la clave privada del usuario (cambio
`claves-usuario-en-alta`): no hay conocimiento cero. Las notas de clase del
13 de octubre y los diagramas `docs/diagrama-secuencia-alta-usuario.md` y
`docs/diagrama-secuencia-login.md` describen la solución: resumir la contraseña
a 256 bits, partirla en dos mitades de 128 bits, usar una para los datos y
enviar la otra como clave de login, que el servidor guarda hasheada con sal y
pimienta.

## What Changes

- **Descomposición de la contraseña en el navegador.** `h = SHA3-256(pw)`,
  de 256 bits, se parte en dos cadenas de 128 bits con el módulo
  `derivarClaves(pw)` de `claves-usuario-en-alta`:
  - `K_L = h[0..127]`, la **clave de login**: es lo único que viaja al servidor,
    tanto en el alta como en el login.
  - `K_D = h[128..255]`, la **clave de datos**: nunca sale del navegador. Hoy ya
    cifra la clave privada del usuario; el cliente la conserva en memoria
    durante la sesión para los pasos siguientes.

  `pw` y `h` se borran de la memoria en cuanto se han derivado las dos mitades.
- **Hash lento con sal y pimienta en el servidor.** La tabla `USER` deja de
  guardar `password` y pasa a guardar `loginKeySalt` (sal aleatoria de 128 bits,
  una por usuario) y `loginKeyHash = KDF(K_L ‖ pimienta, sal)`. La pimienta es
  un valor secreto de la configuración del servidor (`LOGIN_PEPPER`), el mismo
  para todos los usuarios y nunca en la base de datos.
- **Login con `K_L`.** `POST /api/public/login` recibe `{ "email", "loginKey" }`
  en lugar de `{ "email", "password" }`. El servidor recalcula
  `h'_L = KDF(K_L ‖ pimienta, sal)`, lo compara en tiempo constante con
  `loginKeyHash` y descarta `K_L`. Si el email no existe, hace el mismo cálculo
  con una sal ficticia derivada del email, para tardar lo mismo y no facilitar
  la enumeración de usuarios.
- **Alta con `K_L`.** `POST /api/private/admin/users` recibe `loginKey` en
  lugar de `password`. El panel del administrador deriva `K_L` de la contraseña
  inicial en el navegador, junto con el par de claves del cambio anterior.
  La contraseña inicial no sale del navegador del administrador.
- **Servicio de clave de login.** La derivación `KDF`, la sal, la pimienta y
  la comparación son capa de seguridad: quedan detrás de un contrato en
  `server/src/infrastructure/security/`, con tests de contrato, una
  implementación provisional de Claude (scrypt de `node:crypto`) y la
  definitiva del equipo (scrypt, bcrypt o Argon2, a su elección).
- **Semilla y script de ayuda.** Los usuarios de demostración se crean con su
  `loginKeyHash` calculado con el mismo módulo del navegador y la misma
  pimienta que usará el servidor. Un script imprime la `loginKey` de una
  contraseña para poder usar `curl`.
- **BREAKING**: `POST /api/public/login` y `POST /api/private/admin/users` ya
  no admiten `password`; un cuerpo con `password` o sin `loginKey` responde
  `400`. La migración elimina la columna `password`: los usuarios creados antes
  del cambio no pueden iniciar sesión hasta que se vuelvan a crear (en
  desarrollo, `db:seed`).
- **BREAKING**: la regla de longitud mínima de la contraseña (8 caracteres)
  pasa del servidor al cliente, porque el servidor ya no ve la contraseña.

**Qué queda igual.** El token JWT, el middleware, la sección privada y el
resto de la API no cambian. El servidor sigue sin devolver `c_kU` ni `VI` en
el login y el cliente todavía no abre la clave privada.

**Supuesto sobre el orden de las mitades.** La petición de este cambio decía
"la primera mitad para cifrar los datos y la segunda para la contraseña". La
documentación a la que remite (`docs/diagrama-secuencia-alta-usuario.md`,
`docs/diagrama-secuencia-login.md`) y el cambio `claves-usuario-en-alta` fijan
el orden contrario: `K_L = h[0..127]` para el login y `K_D = h[128..255]` para
los datos. Este cambio sigue la documentación, para no divergir de
`derivarClaves` ni de los diagramas. Si se prefiere el otro orden, basta con
intercambiar las dos mitades en `derivarClaves` antes de implementar ambos
cambios; después obligaría a volver a sembrar.

**Fuera de alcance:**
- devolver `c_kU` y `VI` en el login y abrir la clave privada con `K_D`
  (cambio siguiente, según `docs/diagrama-secuencia-login.md`);
- el cambio de contraseña (obliga a recifrar `c_kU` y a recalcular `h_L`);
- la limitación de intentos de login, el doble factor y el reto-respuesta;
- la firma asimétrica del JWT (tareas pendientes de `paso-2-middleware-jwt`).

**Requisito previo.** Este cambio parte de `claves-usuario-en-alta`
implementado: usa su módulo `client/src/security/claves-usuario.js`
(`derivarClaves`, `generarClavesUsuario`) y su formulario de alta con
confirmación de contraseña. Sus deltas de `administracion-usuarios` se
escriben sobre la versión de ese cambio.

**Reparto.** La función `KDF` con sal y pimienta, la comparación en tiempo
constante y la sal ficticia son capa de seguridad: las implementa el equipo.
Claude implementa el contrato y su implementación provisional, la migración,
la configuración, la API, el cliente, la semilla, los tests y la documentación.

## Capabilities

### New Capabilities
- `clave-login`: cómo se obtiene `K_L` en el navegador a partir de la
  contraseña, cómo la guarda el servidor (sal por usuario, pimienta en la
  configuración, hash lento), cómo la verifica (tiempo constante, sal
  ficticia) y el contrato del servicio de clave de login.

### Modified Capabilities
- `autenticacion`: cambian cuatro requisitos:
  - el endpoint de login recibe `loginKey` en lugar de `password`;
  - el error genérico cubre la clave de login incorrecta y los usuarios sin
    clave de login;
  - la validación de la petición exige `loginKey` en base64 de 16 bytes;
  - la pantalla de login deriva `K_L` y `K_D` y nunca envía la contraseña.
- `administracion-usuarios` (sobre la versión de `claves-usuario-en-alta`):
  cambian tres requisitos:
  - el alta recibe `loginKey` en lugar de `password` y lo guarda hasheado;
  - la validación del alta sustituye la regla de `password` por la de
    `loginKey`;
  - el panel deriva `K_L` de la contraseña inicial y comprueba la longitud
    mínima en el cliente.

## Impact

- **Servidor:**
  - nueva migración en `server/migrations/` (quita `password`, añade
    `loginKeyHash` y `loginKeySalt`);
  - `server/src/config.js` (`LOGIN_PEPPER`);
  - `server/src/infrastructure/security/login-key-service.js` (nuevo,
    provisional) y `README.md` de ese directorio;
  - `server/src/infrastructure/http/login-request.js` y `user-request.js`;
  - `server/src/application/auth-service.js` y `user-admin-service.js`;
  - `server/src/infrastructure/database/user-repository.js`;
  - `server/index.js` (conecta el servicio) y `server/seeds/01_usuarios_demo.cjs`;
  - tests en `server/test/`: nuevo `login-key-service.contract.js` y
    `login-key-service.test.js`; cambios en `config`, `login-request`,
    `user-request`, `auth-service`, `user-admin-service`, `user-repository`,
    `public-login`, `admin-users`, `database` y `helpers.js`.
- **Cliente:**
  - `client/src/api/session.js` (clave de datos en memoria), `auth.js`,
    `http.js` y `admin-users.js`;
  - `client/src/components/LoginForm.jsx` y `UserAdminPanel.jsx`;
  - usa `client/src/security/claves-usuario.js` sin modificarlo.
- **Scripts:** nuevo `scripts/derivar-clave-login.mjs` para obtener la
  `loginKey` de una contraseña desde la línea de comandos.
- **Dependencias:** ninguna nueva. La implementación provisional usa `scrypt`
  y `timingSafeEqual` de `node:crypto`. Si el equipo elige Argon2 o bcrypt
  hará falta una librería (`argon2` o `bcryptjs`); se decide en `design.md`.
- **Documentación afectada:**
  - `README.md`: «Estado actual», «Desarrollo» (volver a sembrar; la pimienta
    debe ser la misma para la semilla y el servidor), «Variables de entorno»
    (`LOGIN_PEPPER`), «Vista de login», «API» (cuerpos de login y alta,
    ejemplos de `curl` con el script de ayuda) y «Persistencia con SQLite»
    (tabla `USER`).
  - `docs/primera-memoria/implementacion-y-seguridad.md`: sección nueva
    «Clave de login con sal y pimienta (paso 8)» con la notación, los
    parámetros y «Lo que este paso no protege»; actualizar «Tabla `USER`»,
    «Flujo de `POST /api/public/login`», «Lo que este paso no protege» de los
    pasos 1 y 6, «Estructura del proyecto» y «Trabajo futuro».
  - `docs/primera-memoria/manual-de-usuario.md`: «Iniciar sesión» (la
    contraseña no sale del navegador) y «Dar de alta un usuario».
  - `docs/primera-memoria/stack-tecnologico.md`: `scrypt` de `node:crypto` o
    la librería que elija el equipo.
  - `docs/diagrama-secuencia-alta-usuario.md` y
    `docs/diagrama-secuencia-login.md`: actualizar el «Estado».
  - `server/src/infrastructure/security/README.md`: contrato del servicio de
    clave de login.
