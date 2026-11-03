# Tarjetas de empresa

Práctica de la asignatura Protección de la Información: una aplicación web SaaS para que los empleados de una empresa guarden sus tarjetas de forma segura.

Es una única base de código JavaScript con un cliente Vite + React y una API Express, gestionados desde la raíz del proyecto mediante npm workspaces.

## Estado actual

- **Cliente:** vista de login y vista de sesión, con los textos en español. El login llama al servidor real y la vista de sesión consulta la sección privada de la API con el token de sesión. Todos los usuarios tienen un dashboard **Mis tarjetas** para dar de alta, ver (enmascaradas), modificar y eliminar sus tarjetas. Los administradores ven además un panel para dar de alta, renombrar y eliminar usuarios. Al dar de alta, el formulario pide la contraseña dos veces y el navegador genera el par de claves RSA del nuevo usuario antes de enviar el alta.
- **Servidor:** Express con SQLite, organizado por capas en `server/src/`. Expone una sección pública (`POST /api/public/login`), una sección privada protegida por un middleware de autenticación con JWT (`GET /api/private/me`), las tarjetas del propio usuario (`/api/private/cards`), una sección de administración de usuarios solo para administradores (`/api/private/admin/users`) y un endpoint de salud. Las tarjetas se guardan en `CARD` y la relación N:N `USER_CARD`.
- **Seguridad:** el canal está cifrado: cliente y servidor solo atienden por **HTTPS**, cada uno con su propio certificado autofirmado generado con OpenSSL (ver [HTTPS y certificados](#https-y-certificados)). **La contraseña nunca sale del navegador** (paso 8): el cliente la resume (`h = H(pw)`) y la parte en dos mitades de 128 bits, la **clave de login** `K_L`, que es lo único que viaja al servidor, y la **clave de datos** `K_D`, que se queda en memoria del navegador. El servidor guarda de `K_L` solo una sal por usuario y un hash lento con pimienta (`h_L = scrypt(K_L ‖ pimienta, sal)`, **provisional** hasta que el equipo elija la KDF definitiva) y lo compara en tiempo constante; la pimienta se lee de `LOGIN_PEPPER`. Desde el paso 7, al dar de alta un usuario el navegador genera además el **par de claves RSA-OAEP de 2048 bits** del usuario y guarda en `USER` la clave pública y la clave privada cifrada con AES-128-CBC bajo `K_D` (`client/src/security/claves-usuario.js`), que el servidor no puede abrir. **PROVISIONAL:** el resumen de la contraseña es SHA-256 hasta que el equipo entregue SHA3-256. Lo que sigue sin proteger, a propósito: los datos de las tarjetas, incluido el CVV, **se guardan en texto claro**, y el token se firma con un secreto HMAC **provisional** hasta que el equipo entregue la firma asimétrica.
- **Planificación:** el trabajo se divide en pasos pequeños propuestos como cambios de OpenSpec. Consulta la sección [Planificación](#planificación).

## Estructura

```text
.
├── client/          # Frontend: Vite + React (JavaScript, sin TypeScript)
├── server/          # Backend: Node.js + Express + Knex + SQLite (better-sqlite3)
├── docs/            # Memoria de la práctica y planes de diseño
├── scripts/         # Utilidades del proyecto (generación de certificados)
└── openspec/        # Propuestas de cambio y especificaciones (OpenSpec)
```

## Requisitos

- Node.js 20 o posterior
- npm
- OpenSSL, para generar los certificados. En Linux suele venir instalado (si no, `sudo apt install openssl`). En Windows viene con Git for Windows (`C:\Program Files\Git\usr\bin\openssl.exe`, añádelo al `PATH`) o se instala con `winget install ShiningLight.OpenSSL.Light`

## Desarrollo

```sh
npm install
npm run db:migrate --workspace=server
npm run db:seed --workspace=server
npm run cert
npm run dev
```

La semilla (`db:seed`) deriva la clave de login y genera las claves de los dos usuarios de prueba con el mismo módulo que usa el navegador, así que después de aplicar una migración nueva hay que volver a sembrar para que los usuarios puedan iniciar sesión. La semilla y el servidor deben usar la misma pimienta: o los dos sin `LOGIN_PEPPER` (pimienta de desarrollo, con aviso en consola) o los dos con el mismo valor, por ejemplo `LOGIN_PEPPER=... npm run db:seed --workspace=server` y después `LOGIN_PEPPER=... npm run dev`; con pimientas distintas el login responde `401`. La derivación solo usa Web Crypto y `scrypt` de Node (20 o posterior); está comprobada en Linux y queda pendiente comprobarla en Windows.

`npm run cert` genera los certificados autofirmados del cliente y del servidor (solo hace falta la primera vez). `npm run dev` arranca a la vez el cliente y el servidor. Abre el cliente en <https://localhost:5173>: la primera vez el navegador avisará de que el certificado no es de confianza (ver [HTTPS y certificados](#https-y-certificados)). El cliente envía las solicitudes a la API mediante el proxy de Vite; el servidor escucha en <https://localhost:3000>.

## HTTPS y certificados

Cliente y servidor **solo** atienden por HTTPS y no abren ningún puerto HTTP. Cada uno tiene su propio par de claves y su propio certificado X.509 autofirmado (RSA 2048, SHA-256, 365 días, válido para `localhost`, `127.0.0.1` y `::1`):

| Parte | Certificado y clave | Quién lo verifica |
| --- | --- | --- |
| Cliente (Vite, puerto 5173) | `client/certs/cert.pem`, `client/certs/key.pem` | El navegador |
| Servidor (API, puerto 3000) | `server/certs/cert.pem`, `server/certs/key.pem` | El proxy de Vite, que usa `server/certs/cert.pem` como única autoridad de confianza |

- `npm run cert` los genera con OpenSSL (`scripts/generar-certificados.mjs`) y muestra la huella SHA-256 de cada uno. Si ya existen no los toca; `npm run cert -- --force` los regenera (por ejemplo, cuando caducan).
- Los directorios `certs/` están en `.gitignore`: cada persona genera los suyos y las claves privadas nunca se suben al repositorio.
- Sin certificado, ni el cliente ni el servidor arrancan: muestran un error que pide ejecutar `npm run cert`. Nunca vuelven a HTTP.
- Si el servidor presenta un certificado distinto de `server/certs/cert.pem`, el proxy rechaza la conexión.

El proceso completo (qué hace cada opción de OpenSSL, cómo comprobar los certificados y cómo hacer que el navegador confíe en el del cliente) está en [certificados autofirmados](docs/primera-memoria/certificados-autofirmados.md).

## Comandos disponibles

```sh
npm run cert         # Genera los certificados autofirmados (--force para regenerarlos)
npm run dev          # Inicia el cliente y el servidor en modo desarrollo
npm run build        # Compila el cliente en client/dist/
npm run start:server # Inicia solo el servidor
npm test --workspace=server  # Ejecuta los tests del servidor (node:test)
npm test --workspace=client  # Ejecuta los tests de la validación del cliente (node:test)
```

### Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del servidor |
| `JWT_SECRET` | aleatorio por proceso | Secreto **provisional** para firmar los tokens. Mínimo 32 caracteres |
| `JWT_TTL_SECONDS` | `3600` | Tiempo de vida del token de sesión, en segundos |
| `LOGIN_PEPPER` | pimienta de desarrollo (pública) | Pimienta del hash de la clave de login. Mínimo 16 caracteres. Debe ser la misma para la semilla y el servidor |
| `TLS_CERT_FILE` | `server/certs/cert.pem` | Certificado del servidor |
| `TLS_KEY_FILE` | `server/certs/key.pem` | Clave privada del servidor |

Si `JWT_SECRET` no está definido, el servidor genera un secreto aleatorio y lo avisa en la consola. Entonces los tokens dejan de valer cada vez que el servidor se reinicia, también cuando `npm run dev` lo recarga tras un cambio de código: habrá que volver a iniciar sesión. Para no perder la sesión al desarrollar, define un secreto propio. Para probar la caducidad, usa un tiempo de vida corto:

```sh
JWT_SECRET=un-secreto-de-desarrollo-de-al-menos-32-caracteres JWT_TTL_SECONDS=10 npm run dev
```

## Vista de login

La vista de login es un formulario con email y contraseña. El usuario se identifica con su email. La contraseña no sale del navegador. Las llamadas de autenticación están encapsuladas en `client/src/api/auth.js`:

- `login({ email, password })` deriva `{ K_L, K_D }` de la contraseña con `derivarClaves` (`client/src/security/claves-usuario.js`), llama a `POST /api/public/login` con `{ email, loginKey }` (`K_L` en base64) y, si responde `200`, guarda el token de sesión y `K_D` **solo en memoria** (`client/src/api/session.js`). Con cualquier error descarta `K_D`.
- `getCurrentUser()` llama a `GET /api/private/me` con el token mediante `apiFetch` (`client/src/api/http.js`), que añade la cabecera `Authorization: Bearer <token>`.
- `logout()` descarta el token y borra `K_D`. No hay nada que cerrar en el servidor. Un `401` de la sección privada hace lo mismo.

El seed crea dos usuarios de prueba para desarrollo:

| Email | Contraseña | Rol |
| --- | --- | --- |
| `empleado@empresa.com` | `demo1234` | Empleado |
| `admin@empresa.com` | `admin1234` | Administrador |

Con credenciales incorrectas, la vista muestra el error genérico `Email o contraseña incorrectos.`; si el servidor no responde, `No se ha podido iniciar sesión. Inténtalo de nuevo.`. Tras iniciar sesión se muestran el nombre y el email que devuelve `GET /api/private/me`, y un botón para cerrar sesión. La vista vuelve a consultar `/me` cada vez que la ventana recupera el foco. Si el token ha caducado o no es válido, vuelve al login con el aviso `Tu sesión ha caducado. Vuelve a iniciar sesión.`. El token solo se guarda en memoria, así que al recargar la página vuelve a aparecer el login.

Debajo aparece el dashboard **Mis tarjetas**, para todos los usuarios:

- La lista muestra cada tarjeta con el número enmascarado (`•••• 1111`) y la caducidad (`MM/AA`), o `Todavía no has guardado ninguna tarjeta.` si no hay ninguna. El número completo y el CVV nunca vuelven del servidor.
- El formulario **Añadir una tarjeta** pide número, caducidad (mes y año) y CVV, con los `autocomplete` de tarjeta del navegador. Valida en el cliente con las mismas reglas que el servidor (Luhn, caducidad no vencida, CVV de 3 o 4 dígitos) y muestra el error junto al campo sin enviar nada. El CVV se borra del formulario tras cada envío.
- **Editar** abre un formulario en la fila con la caducidad rellenada y el número y el CVV vacíos: un campo vacío no se cambia y solo se envía lo modificado. **Eliminar** pide confirmación en la misma fila.
- Si la tarjeta se ha borrado desde otra sesión, se muestra `Tarjeta no encontrada` y desaparece de la lista.

Las llamadas están en `client/src/api/cards.js`, la validación en `client/src/validation/card.js` y el dashboard en `client/src/components/CardDashboard.jsx`. Los datos de las tarjetas no se escriben en la consola ni en el almacenamiento del navegador.

Si el usuario es administrador, debajo aparece el panel **Usuarios**: una tabla con el nombre, el email y el rol de cada cuenta, un formulario para dar de alta usuarios (nombre, email, contraseña inicial y si es administrador), un botón para editar el nombre en la propia fila y otro para eliminar, que pide confirmación en la misma fila. La fila propia no tiene botón de eliminar. Los errores del servidor (por ejemplo, `Ya existe un usuario con ese email`) se muestran encima de la tabla. Si el servidor deja de reconocer al usuario como administrador, el panel muestra `No tienes permiso para gestionar usuarios.` y oculta las acciones. Los empleados no ven el panel. Las llamadas están en `client/src/api/admin-users.js` y el panel en `client/src/components/UserAdminPanel.jsx`.

El comportamiento de la pantalla se describe en el [manual de usuario](docs/primera-memoria/manual-de-usuario.md), y sus medidas de seguridad en [implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md).

## API

La API del servidor incluye:

- `POST /api/public/login`: comprueba un email y la clave de login. Envía `{ "email": "...", "loginKey": "..." }`, donde `loginKey` son los 16 bytes de `K_L` en base64 estándar (24 caracteres); la contraseña no viaja y un cuerpo con `password` o con cualquier otro campo responde `400`. Responde `200` con `{ "token", "user": { "email", "name", "isAdmin" } }`, donde `token` es el JWT de sesión, `401` con `{ "error": "Credenciales inválidas" }` (tanto si el email no existe como si la clave no coincide o el usuario no tiene clave de login, y en los tres casos tras calcular un hash) o `400` si la petición está mal formada. El servidor recalcula `scrypt(K_L ‖ pimienta, sal)` con la sal del usuario y lo compara con `loginKeyHash` en tiempo constante.
- `GET /api/private/me`: devuelve `{ "email", "name", "isAdmin" }` del usuario del token. Requiere `Authorization: Bearer <token>`.
- `GET /api/private/admin/users`: lista los usuarios. Responde `200` con `{ "users": [{ "id", "name", "email", "isAdmin" }] }` ordenados por `id`, nunca la contraseña.
- `POST /api/private/admin/users`: da de alta un usuario. Envía `{ "name", "email", "loginKey", "isAdmin", "publicKey", "encryptedPrivateKey", "privateKeyIv" }` (`isAdmin` es opcional y por defecto `false`). `loginKey` es `K_L` en base64, como en el login: el servidor genera una sal de 16 bytes, guarda `loginKeySalt` y `loginKeyHash` y descarta `K_L`. Las tres claves las genera el navegador y van en base64: `publicKey` es la clave pública RSA del usuario en formato SPKI, `encryptedPrivateKey` la clave privada (PKCS#8) cifrada con AES-128-CBC y `privateKeyIv` el vector de inicialización. Responde `201` con el usuario creado (nunca las claves), `409` con `{ "error": "Ya existe un usuario con ese email" }` o `400` con `{ "error": "Datos de usuario no válidos" }`. Reglas: nombre de 1 a 100 caracteres, email con una sola `@` y hasta 254 caracteres (se guarda en minúsculas y sin espacios), `loginKey` de exactamente 16 bytes, clave pública RSA de al menos 2048 bits, vector de 16 bytes y clave cifrada de 16 a 4096 bytes en bloques de 16. La longitud de la contraseña (8 a 128 caracteres) la comprueba el cliente, porque el servidor ya no la ve; un cuerpo con `password` responde `400`. `GET` tampoco devuelve nunca la sal, el hash ni las claves.
- `PATCH /api/private/admin/users/:id`: cambia el nombre. Envía `{ "name" }` y nada más. Cualquier otro campo da `400`. Responde `200` con el usuario actualizado, o `404` con `{ "error": "Usuario no encontrado" }`.
- `DELETE /api/private/admin/users/:id`: elimina el usuario y responde `204`. Un administrador no puede eliminarse a sí mismo (`400` con `{ "error": "No puedes eliminar tu propia cuenta" }`). Si el usuario no existe responde `404`.
- `GET /api/private/cards`: lista las tarjetas del usuario del token por orden de alta. Responde `200` con `{ "cards": [{ "id", "last4", "expiryMonth", "expiryYear", "createdAt" }] }`; nunca el número completo ni el CVV.
- `POST /api/private/cards`: da de alta una tarjeta con el usuario del token como único propietario. Envía `{ "number", "expiryMonth", "expiryYear", "cvv" }`. Responde `201` con la tarjeta enmascarada o `400` con `{ "error": "Datos de tarjeta no válidos" }`. Reglas: número de 13 a 19 dígitos que supere Luhn (se admiten espacios y guiones, que se quitan), mes entero de 1 a 12, año entero de cuatro cifras como mucho 20 años por delante, caducidad no anterior al mes actual, CVV de 3 o 4 dígitos y ningún otro campo. **Los datos se guardan en texto claro.**
- `PATCH /api/private/cards/:id`: modifica solo los campos enviados (al menos uno; mes y año siempre juntos) con las mismas reglas. Responde `200` con la tarjeta enmascarada, `400`, `403` con `{ "error": "Acceso denegado" }` si el usuario la ve pero no es su propietario (tarjetas compartidas, fase 2) o `404` con `{ "error": "Tarjeta no encontrada" }`.
- `DELETE /api/private/cards/:id`: elimina la tarjeta y responde `204`, o `403`/`404` como el anterior.
- `GET /api/health`: comprueba que el servidor responde.

`/api/public` agrupa los endpoints que no requieren sesión. Todo lo que hay bajo `/api/private` pasa antes por el middleware de autenticación, que verifica la firma, el emisor y la caducidad del token y deja el usuario y su rol en `request.user`. Ante cualquier fallo responde `401` con `{ "error": "No autenticado" }` y la cabecera `WWW-Authenticate: Bearer`, sin indicar la causa.

Las rutas de `/api/private/admin` exigen además que el usuario sea administrador. Se comprueba el claim `isAdmin` del token y también, en cada petición, que el usuario siga existiendo y siga siendo administrador en la base de datos. Si no se cumple, responden `403` con `{ "error": "Acceso denegado" }`.

Las rutas de `/api/private/cards` solo operan sobre las tarjetas relacionadas con el usuario del token en `USER_CARD`; ser administrador no da acceso a las de otros. Una tarjeta ajena, inexistente o con un identificador que no es un UUID responde `404`, sin distinguir el caso.

Ejemplo con `curl` (con el servidor en marcha y el seed aplicado, desde la raíz del proyecto). `--cacert` le dice a `curl` que confíe en el certificado autofirmado del servidor; sin él, rechaza la conexión, y por `http://` el servidor no responde:

```sh
# 1. Deriva la clave de login de la contraseña (lo que hace el navegador), inicia sesión y guarda el token
LOGIN_KEY=$(node scripts/derivar-clave-login.mjs demo1234)
TOKEN=$(curl -s --cacert server/certs/cert.pem -X POST https://localhost:3000/api/public/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"empleado@empresa.com\",\"loginKey\":\"$LOGIN_KEY\"}" \
  | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).token))')

# 2. Consulta la sección privada con el token → 200
curl -s --cacert server/certs/cert.pem https://localhost:3000/api/private/me -H "Authorization: Bearer $TOKEN"

# 3. Sin token → 401 {"error":"No autenticado"}
curl -s --cacert server/certs/cert.pem -i https://localhost:3000/api/private/me
```

Administración de usuarios con `curl`, como administrador:

```sh
ADMIN_KEY=$(node scripts/derivar-clave-login.mjs admin1234)
ADMIN_TOKEN=$(curl -s --cacert server/certs/cert.pem -X POST https://localhost:3000/api/public/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@empresa.com\",\"loginKey\":\"$ADMIN_KEY\"}" \
  | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).token))')

# Alta de un empleado → 201. La clave de login y las claves del usuario las genera
# el navegador; para curl, el script de ayuda imprime el cuerpo completo
BODY=$(node scripts/generar-claves-usuario.mjs inicial123 'Ana Pérez' ana@empresa.com)
curl -s --cacert server/certs/cert.pem -X POST https://localhost:3000/api/private/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d "$BODY"

# Lista de usuarios → 200
curl -s --cacert server/certs/cert.pem https://localhost:3000/api/private/admin/users -H "Authorization: Bearer $ADMIN_TOKEN"

# Con el token de un empleado → 403 {"error":"Acceso denegado"}
curl -s --cacert server/certs/cert.pem -i https://localhost:3000/api/private/admin/users -H "Authorization: Bearer $TOKEN"
```

Tarjetas con `curl`, con el token del empleado del primer ejemplo:

```sh
# Lista de tarjetas → 200 con la tarjeta de prueba •••• 1111
curl -s --cacert server/certs/cert.pem https://localhost:3000/api/private/cards -H "Authorization: Bearer $TOKEN"

# Alta → 201 {"id":"…","last4":"4444",…}
CARD_ID=$(curl -s --cacert server/certs/cert.pem -X POST https://localhost:3000/api/private/cards \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"number":"5555 5555 5555 4444","expiryMonth":11,"expiryYear":2029,"cvv":"456"}' \
  | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).id))')

# Cambia solo la caducidad → 200
curl -s --cacert server/certs/cert.pem -X PATCH "https://localhost:3000/api/private/cards/$CARD_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"expiryMonth":6,"expiryYear":2031}'

# Borra la tarjeta → 204
curl -s --cacert server/certs/cert.pem -i -X DELETE "https://localhost:3000/api/private/cards/$CARD_ID" -H "Authorization: Bearer $TOKEN"
```

El servidor sigue una arquitectura por capas (dominio, aplicación e infraestructura) descrita en [implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md).

## Persistencia con SQLite

La base de datos es el archivo `server/data/app.sqlite`, gestionado con Knex. El directorio `server/data/` se crea automáticamente cuando hace falta. El archivo de la base de datos está excluido de Git para no subir los datos locales.

Las tablas `USER`, `CARD` y `USER_CARD` se administran mediante migraciones de Knex. `USER` guarda `id`, `name`, `email`, `isAdmin`, la sal y el hash de la clave de login (`loginKeySalt`, `loginKeyHash`) y las claves del usuario (`publicKey`, `encryptedPrivateKey`, `privateKeyIv`); no guarda la contraseña. El historial de migraciones también se guarda en esta base de datos, en las tablas `knex_migrations` y `knex_migrations_lock`.

Iniciar el servidor no ejecuta automáticamente las migraciones pendientes; aplícalas con el comando `db:migrate`.

Cada conexión activa las claves foráneas de SQLite (`PRAGMA foreign_keys = ON`, en `pool.afterCreate` de `server/knexfile.cjs`), que SQLite ignora por defecto.

### Tablas de tarjetas

Las tarjetas y los usuarios se relacionan como **N:N**, aunque en la fase 1 cada tarjeta tenga un único usuario, para que compartir tarjetas en la fase 2 consista en añadir filas y no en migrar datos:

- `CARD`: `id` (UUID v4 generado en el servidor), `number` y `cvv` (texto, para conservar los ceros a la izquierda), `expiryMonth`, `expiryYear`, `createdAt` y `updatedAt` (ISO 8601 en UTC). No tiene ninguna columna de propietario.
- `USER_CARD`: `userId`, `cardId`, `isOwner` y `createdAt`, con clave primaria `(userId, cardId)` y claves foráneas con borrado en cascada. El índice único parcial `user_card_one_owner` impide que una tarjeta tenga dos propietarios.

El repositorio (`server/src/infrastructure/database/card-repository.js`) lee las tarjetas siempre a través de `USER_CARD`, solo deja modificarlas o borrarlas a su propietario y no tiene ninguna operación para dar acceso a otro usuario. Al eliminar un usuario se eliminan también las tarjetas de las que es propietario.

**PROVISIONAL:** número, caducidad y CVV se guardan en texto claro; la fase 1 los sustituirá por un sobre cifrado en el navegador. Guardar el CVV incumple PCI DSS a sabiendas: es un ejercicio docente.

## Migraciones de base de datos

Ejecuta estos comandos desde la raíz del proyecto:

```sh
# Genera una migración con marca de tiempo
npm run db:make --workspace=server -- add_table_name

# Aplica todas las migraciones pendientes
npm run db:migrate --workspace=server

# Revierte el último lote de migraciones aplicado
npm run db:rollback --workspace=server

# Borra usuarios y tarjetas y crea los datos de prueba
npm run db:seed --workspace=server
```

`db:make` crea un archivo CommonJS en `server/migrations/`. Define el cambio de esquema en `up` y su reversión en `down`. Knex registra cada migración aplicada y no la vuelve a ejecutar.

La primera migración crea la tabla `USER` con `name`, `email` e `isAdmin` (booleano, `false` por defecto). La segunda añade la clave primaria `id`, la columna `password` (en texto claro en aquel paso) y hace único el `email`, que se guarda siempre en minúsculas. La tercera borra la antigua tabla `notes`, y la cuarta crea `CARD` y `USER_CARD`. La quinta añade a `USER` las claves del usuario (`publicKey`, `encryptedPrivateKey`, `privateKeyIv`, paso 7) y la sexta sustituye `password` por `loginKeySalt` y `loginKeyHash` (paso 8); los usuarios creados antes quedan con esas columnas a `NULL` y no pueden iniciar sesión, así que hay que volver a sembrar. Su `down` restaura `password` vacía. El seed está en `server/seeds/`, solo debe usarse en desarrollo y crea, además de los usuarios de prueba, una tarjeta de prueba del empleado (número de test de Visa `4111 1111 1111 1111`, caducidad 12/2030, CVV `123`). Para cambios posteriores, crea una migración nueva en vez de modificar una que ya se haya aplicado.

## Planificación

El proyecto usa [OpenSpec](https://github.com/Fission-AI/OpenSpec) (instalado como dependencia de desarrollo) para proponer y seguir los cambios. Los comandos `/opsx:*` de Claude Code y las skills de `.claude/` trabajan sobre la carpeta `openspec/`.

- [`openspec/specs/autenticacion/`](openspec/specs/autenticacion/spec.md): especificación vigente del login.
- [`openspec/changes/paso-2-middleware-jwt/`](openspec/changes/paso-2-middleware-jwt/): paso 2, sesión con JWT y middleware de autenticación. Está implementado salvo la firma asimétrica definitiva, que corresponde al equipo (ver [`server/src/infrastructure/security/README.md`](server/src/infrastructure/security/README.md)).
- [`openspec/changes/archive/2026-10-13-paso-1-login-texto-claro/`](openspec/changes/archive/2026-10-13-paso-1-login-texto-claro/): paso 1, ya implementado y archivado. Login de extremo a extremo en texto claro, con la arquitectura por capas del servidor y la sección pública de la API. Es la base de los pasos siguientes.
- [`openspec/changes/archive/2026-10-13-paso-4-tabla-tarjetas/`](openspec/changes/archive/2026-10-13-paso-4-tabla-tarjetas/): paso 4, tablas `CARD` y `USER_CARD` con relación N:N y su repositorio. Implementado y archivado; especificación vigente en [`openspec/specs/almacen-tarjetas/`](openspec/specs/almacen-tarjetas/spec.md).
- [`openspec/changes/archive/2026-10-13-paso-5-dashboard-tarjetas/`](openspec/changes/archive/2026-10-13-paso-5-dashboard-tarjetas/): paso 5, API y dashboard para que cada usuario dé de alta, vea, modifique y elimine sus tarjetas. Implementado y archivado; especificación vigente en [`openspec/specs/panel-tarjetas/`](openspec/specs/panel-tarjetas/spec.md).
- [`openspec/changes/fase-1-registro-y-cifrado/`](openspec/changes/fase-1-registro-y-cifrado/): propuesta, diseño, especificaciones y tareas de la fase 1, con el registro por invitación, el login sin enviar la contraseña, el doble factor y la bóveda de tarjetas cifrada en el navegador. Cada tarea indica si la implementa el equipo (capa de seguridad) o Claude (resto del sistema).
- [`docs/plan-backend-login.md`](docs/plan-backend-login.md): plan anterior del servidor de login, basado en el contrato `POST /api/login` con `{ "email", "password" }`.

El paso 1 implementa el login con el contrato `POST /api/public/login`. La propuesta de la fase 1 lo sustituirá por un login en varios pasos en el que la contraseña nunca sale del navegador; antes de aplicarla hay que dividirla en pasos pequeños que partan de lo que deja el paso 1.

## Documentación

La primera memoria de la práctica está en [`docs/primera-memoria/`](docs/primera-memoria/):

- [Stack tecnológico](docs/primera-memoria/stack-tecnologico.md)
- [Manual de usuario](docs/primera-memoria/manual-de-usuario.md)
- [Implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md)
