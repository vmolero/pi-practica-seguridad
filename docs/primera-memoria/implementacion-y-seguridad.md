# Implementación y seguridad

Este documento describe cómo está organizado el código y qué medidas de
seguridad se aplican en cada parte. El trabajo avanza en pasos pequeños:

- **Paso 1:** login de extremo a extremo **sin ninguna medida de seguridad**.
  La contraseña viaja y se guarda en texto claro.
- **Paso 2:** sesión con un token JWT y un middleware de autenticación que
  protege la sección privada de la API. La firma del token es todavía
  **provisional** (HMAC con un secreto compartido).
- **Paso 3:** panel de administración de usuarios (alta, cambio de nombre y
  eliminación) y primer control de acceso por rol en el servidor.
- **Pasos 4 y 5:** tabla de tarjetas y dashboard **Mis tarjetas**, todavía con
  los datos en texto claro.
- **Paso 6:** cifrado del canal. Cliente y servidor solo atienden por HTTPS,
  cada uno con su propio certificado autofirmado generado con OpenSSL.

Es la base sobre la que los pasos siguientes añadirán la criptografía; no es el
diseño final.

## Estructura del proyecto

El proyecto es un repositorio único con dos paquetes gestionados mediante
**npm workspaces** desde la raíz:

```text
.
├── package.json              # Define los workspaces y los scripts comunes (dev, build, cert...)
├── scripts/
│   └── generar-certificados.mjs # npm run cert: certificados autofirmados con OpenSSL
├── client/                   # Frontend: Vite + React (JavaScript)
│   ├── certs/                # Certificado y clave del cliente (no se versiona)
│   ├── index.html            # Página única; monta la aplicación en #root
│   ├── vite.config.js        # HTTPS, plugin de React y proxy de /api que verifica al servidor
│   └── src/
│       ├── main.jsx          # Punto de entrada: renderiza <App />
│       ├── App.jsx           # Decide si mostrar el login o la sesión iniciada
│       ├── style.css
│       ├── api/
│       │   ├── admin-users.js # listUsers(), createUser(), renameUser(), deleteUser()
│       │   ├── auth.js       # login(), getCurrentUser() y logout()
│       │   ├── cards.js      # listCards(), createCard(), updateCard(), deleteCard()
│       │   ├── http.js       # apiFetch(): añade el token; 401 → sesión caducada
│       │   └── session.js    # Token de sesión, solo en memoria
│       ├── validation/
│       │   └── card.js       # validateCardForm(): mismas reglas que el servidor
│       └── components/
│           ├── CardDashboard.jsx # Mis tarjetas: lista, alta, edición y borrado
│           ├── LoginForm.jsx    # Formulario de email y contraseña
│           ├── SessionView.jsx  # Vista de sesión: datos de /api/private/me
│           └── UserAdminPanel.jsx # Panel de usuarios (solo administradores)
└── server/                   # Backend: Node.js + Express + Knex + SQLite
    ├── certs/                # Certificado y clave del servidor (no se versiona)
    ├── index.js              # Arranque: construye las dependencias y escucha por HTTPS
    ├── knexfile.cjs          # Configuración de Knex; activa las claves foráneas
    ├── migrations/           # Migraciones de Knex (USER, CARD, USER_CARD)
    ├── seeds/                # Usuarios y tarjeta de prueba para desarrollo
    ├── test/                 # Tests con node:test
    └── src/
        ├── app.js            # createApp(): monta los routers y el manejo de errores
        ├── config.js         # loadConfig(): puerto, token y rutas del certificado TLS
        ├── domain/
        │   ├── user.js       # toPublicUser() y toAdminUser(): datos sin contraseña
        │   ├── card.js       # toCard() y toMaskedCard(): sin número completo ni CVV
        │   └── session.js    # Claims del token ↔ usuario de la sesión
        ├── application/
        │   ├── auth-service.js  # Servicio de autenticación: login() → { token, user }
        │   ├── user-admin-service.js # Alta, lista, cambio de nombre y borrado de usuarios
        │   ├── card-service.js  # Tarjetas propias: acceso por relación y propiedad
        │   └── errors.js        # Errores de aplicación (credenciales, token, usuarios)
        └── infrastructure/
            ├── database/
            │   ├── knex.js              # Conexión de Knex
            │   ├── user-repository.js   # findByEmail, findById, list, create, rename, remove
            │   └── card-repository.js   # Tarjetas siempre a través de USER_CARD
            ├── security/
            │   ├── README.md            # Contrato del servicio de tokens (equipo/Claude)
            │   ├── issuer.js            # Valor del claim iss
            │   └── token-service.js     # PROVISIONAL: firma y verificación HS256
            └── http/
                ├── https-server.js      # createHttpsServer(): solo HTTPS, sin certificado no arranca
                ├── public-router.js     # /api/public (sin sesión)
                ├── private-router.js    # /api/private (con sesión)
                ├── auth-middleware.js   # Middleware de autenticación
                ├── require-admin.js     # Middleware de rol: solo administradores
                ├── admin-router.js      # /api/private/admin (usuarios)
                ├── cards-router.js      # /api/private/cards (tarjetas propias)
                ├── card-request.js      # Validación de tarjetas (Luhn, caducidad, CVV)
                ├── user-request.js      # Validación de las peticiones de usuarios
                └── login-request.js     # Validación de la petición de login
```

`npm run dev` en la raíz arranca a la vez el cliente (Vite, puerto 5173) y el
servidor (Express, puerto 3000), los dos por HTTPS. En desarrollo, el proxy de
Vite reenvía las peticiones a `/api` al servidor, así que el navegador solo
habla con un origen.

## Vista de login

### Componentes

- **`App.jsx`** guarda en el estado de React el usuario autenticado
  (`{ email, name, isAdmin }`) o `null`, y el aviso que debe mostrar el login
  (por ejemplo, el de sesión caducada). Si hay usuario muestra `SessionView`; si no, muestra
  `LoginForm`. El estado solo vive en memoria: al recargar la página se vuelve
  a la pantalla de login.
- **`LoginForm.jsx`** contiene el formulario. Valida los campos, llama a
  `login()` y, si todo va bien, entrega el usuario a `App` mediante
  `onSuccess`.
- **`SessionView.jsx`** pide al servidor el usuario autenticado
  (`GET /api/private/me`) al aparecer y cada vez que la ventana recupera el
  foco, y muestra su nombre y su email junto al botón **Cerrar sesión**. Si el
  servidor rechaza el token, avisa a `App`, que vuelve al login con el mensaje
  de sesión caducada. Al aparecer, mueve el foco al título para que los
  lectores de pantalla anuncien el cambio. Debajo monta `CardDashboard` para
  todos los usuarios y, si es administrador, `UserAdminPanel`.
- **`CardDashboard.jsx`** lista, da de alta, modifica y elimina las tarjetas
  del usuario (ver [Dashboard de tarjetas](#dashboard-de-tarjetas-paso-5)).

### Capa de autenticación (`client/src/api/auth.js`)

Toda la comunicación con el servidor relacionada con la autenticación está en
este módulo, que exporta:

- `login({ email, password })`: envía `POST /api/public/login` con un cuerpo
  JSON `{ email, password }`. Si el servidor responde `200`, guarda el token
  recibido en memoria y devuelve `{ email, name, isAdmin }`. Si responde
  `401`, lanza un `Error` con `GENERIC_LOGIN_ERROR`; ante cualquier otro fallo
  (servidor caído, error `5xx`, petición rechazada) lanza uno con
  `CONNECTION_ERROR`.
- `getCurrentUser()`: llama a `GET /api/private/me` mediante `apiFetch` y
  devuelve el usuario del token.
- `logout()`: descarta el token. El servidor no guarda sesiones, así que no hay
  nada que cerrar allí.
- `GENERIC_LOGIN_ERROR`: `"Email o contraseña incorrectos."`.
- `CONNECTION_ERROR`: `"No se ha podido iniciar sesión. Inténtalo de nuevo."`.

`LoginForm` muestra el mensaje del error que lanza `login()`. Como `auth.js`
solo produce esos dos mensajes, la interfaz nunca muestra el texto que devuelve
el servidor.

### Validación en el cliente

El formulario usa `noValidate` para desactivar la validación nativa del
navegador y aplicar la suya propia, con mensajes en español:

| Comprobación                                    | Mensaje                                       |
|-------------------------------------------------|-----------------------------------------------|
| Email vacío (tras quitar espacios)              | `Introduce tu email.`                         |
| Email sin formato `algo@dominio.ext`            | `Introduce un email con un formato válido.`   |
| Contraseña vacía                                | `Introduce tu contraseña.`                    |

El email se envía sin los espacios del principio y del final. La contraseña se
envía tal cual, sin recortarla.

### Medidas de seguridad en el cliente

- **No se persiste la contraseña.** La contraseña solo vive en el estado del
  formulario mientras el usuario la escribe y se pasa a `login()`. No se guarda
  en `localStorage`, `sessionStorage`, cookies ni en ningún otro almacenamiento
  del navegador, y no se escribe en la consola. El campo se vacía tanto después
  de un login correcto como de uno fallido. `App` solo guarda el email del
  usuario, y únicamente en memoria.
- **Mensajes de error genéricos.** Si las credenciales no son válidas, el
  formulario muestra siempre `Email o contraseña incorrectos.`, sin indicar si
  el email no existe o si la contraseña es incorrecta. Si el fallo es de otro
  tipo, muestra el mensaje genérico de conexión, sin detalles técnicos. Así no se facilita la enumeración de usuarios. El mensaje se
  muestra en una zona con `role="alert"` para que los lectores de pantalla lo
  anuncien.
- **Atributos `autocomplete` adecuados.** El campo de email usa `type="email"`
  y `autocomplete="username"` (además de `autocapitalize="none"` y
  `spellcheck="false"`); el de contraseña usa `type="password"` y
  `autocomplete="current-password"`. Así los gestores de contraseñas funcionan
  correctamente, lo que favorece el uso de contraseñas largas y únicas.
- **Sin envíos duplicados.** Mientras la petición está en curso, los campos y
  el botón quedan deshabilitados y se ignoran nuevos envíos.
- **La validación del cliente no sustituye a la del servidor.** Las
  comprobaciones anteriores solo mejoran la experiencia de usuario. Cualquiera
  puede saltárselas enviando peticiones directamente a la API, por lo que el
  servidor vuelve a validar los datos que recibe (ver más abajo).

## Servidor: login en texto claro (paso 1)

### Arquitectura por capas

El código nuevo del servidor está en `server/src/` y se divide en tres capas.
Las dependencias van solo hacia dentro (infraestructura → aplicación →
dominio):

- **Dominio** (`domain/user.js`): `toPublicUser(user)` devuelve los datos del
  usuario que se pueden enviar al cliente, `{ email, name, isAdmin }`, y nunca
  la contraseña.
- **Aplicación** (`application/auth-service.js`): el servicio de autenticación.
  `login({ email, password })` pide el usuario al repositorio y comprueba la
  contraseña. No sabe nada de HTTP ni de la base de datos.
- **Infraestructura**:
  - `http/public-router.js` monta la sección pública de la API,
    `/api/public`, con los endpoints que no requieren sesión.
  - `http/login-request.js` comprueba la forma de la petición.
  - `database/user-repository.js` busca usuarios en la tabla `USER` con Knex.

Cada pieza se crea con una función fábrica que recibe sus dependencias
(`createAuthService({ userRepository })`, `createApp({ authService })`) y
`server/index.js` es el único sitio que las conecta. Así los tests usan un
repositorio en memoria o una base de datos temporal sin tocar la real.

### Flujo de `POST /api/public/login`

1. El router recibe el cuerpo JSON. Si no es JSON válido, responde `400`.
2. `parseLoginRequest` exige que `email` y `password` sean cadenas no vacías
   de como máximo 254 y 128 caracteres. Si no lo son, responde `400` sin
   consultar la base de datos. El email se normaliza (sin espacios y en
   minúsculas); la contraseña se usa tal cual.
3. El servicio busca el usuario por email y compara la contraseña con `===`.
   Si el usuario no existe o la contraseña no coincide, lanza
   `InvalidCredentialsError`.
4. Si las credenciales son válidas, el servicio firma el token de sesión
   (ver más abajo) y el router responde `200` con
   `{ "token", "user": toPublicUser(user) }`. Si no, responde `401` con
   `{ "error": "Credenciales inválidas" }`.

| Caso | Código | Cuerpo |
| --- | --- | --- |
| Credenciales válidas | 200 | `{ "token", "user": { "email", "name", "isAdmin" } }` |
| Email inexistente o contraseña incorrecta | 401 | `{ "error": "Credenciales inválidas" }` |
| Cuerpo mal formado o JSON ilegible | 400 | `{ "error": "Petición de login no válida" }` |
| Error inesperado | 500 | `{ "error": "Error interno del servidor" }` |

### Tabla `USER`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | entero | Clave primaria autoincremental |
| `name` | texto | Obligatorio |
| `email` | texto | Obligatorio, único, siempre en minúsculas |
| `password` | texto | Obligatorio. **En texto claro** en este paso |
| `isAdmin` | booleano | `true` para gestores; por defecto `false` |

El seed `server/seeds/01_usuarios_demo.cjs` crea un empleado y un
administrador de prueba para desarrollo.

### Lo que este paso no protege

Este paso deja a propósito sin resolver todos los riesgos siguientes:

- La contraseña viaja en claro por HTTP: cualquiera que observe la red la ve.
  *(Resuelto en el paso 6: el canal va cifrado con TLS.)*
- La contraseña se guarda en claro: quien lea la base de datos obtiene todas.
- La comparación con `===` no es de tiempo constante.
- No hay límite de intentos de login.

La comparación está aislada en una sola línea de `auth-service.js`, marcada
como provisional, para que la capa de seguridad la sustituya sin tocar el resto
del código.

## Sesión con JWT y middleware de autenticación (paso 2)

### Qué es el token

Al iniciar sesión, el servidor entrega al cliente un **JSON Web Token**
(RFC 7519): una afirmación firmada por el servidor que dice quién es el
usuario y hasta cuándo vale. El servidor no guarda nada por sesión; en cada
petición le basta con verificar la firma y la caducidad del token.

Notación (implementación provisional):

```text
K   = secreto del servidor (JWT_SECRET, ≥ 32 caracteres)
h   = base64url({ "alg": "HS256", "typ": "JWT" })
p   = base64url({ sub, email, name, isAdmin, iss, iat, exp })
s   = HMAC-SHA256(K, h || "." || p)
t   = h || "." || p || "." || base64url(s)
```

| Claim | Valor |
| --- | --- |
| `sub` | Id del usuario, como texto |
| `email`, `name` | Datos del usuario, para no consultar la base de datos |
| `isAdmin` | Rol (booleano) |
| `iss` | `"tarjetas-de-empresa"`: emisor del token |
| `iat` | Instante de emisión, en segundos UNIX |
| `exp` | `iat + ttl`, con `ttl` = `JWT_TTL_SECONDS` (1 hora por defecto) |

El token **no contiene la contraseña** y no está cifrado: cualquiera que lo
tenga puede leer los claims (base64url no es un cifrado). Lo que garantiza la
firma es que nadie sin `K` puede crear un token ni modificar uno existente sin
que el servidor lo detecte.

### Verificación

Dado un token `t`:

1. Separar `t` en `(h, p, s)`. Si no tiene tres partes o no son base64url y
   JSON válidos → rechazo.
2. Comprobar que `alg(h) = HS256`. El algoritmo admitido es **fijo** en el
   servidor: nunca se usa el que declara el token, así que un token con
   `alg: none` o con otro algoritmo se rechaza.
3. Recalcular `HMAC-SHA256(K, h || "." || p)` y compararlo con `s`. Si
   difieren (claims manipulados o firma con otra clave) → rechazo.
4. Comprobar que `iss(p) = "tarjetas-de-empresa"` y que `exp(p) > ahora`, sin
   tolerancia de reloj. Si no → rechazo.

La firma y la verificación están detrás de una interfaz,
`createTokenService(...) → { sign, verify }`, descrita en
`server/src/infrastructure/security/README.md`. Es **capa de seguridad del
equipo**: la implementación actual es provisional y se sustituirá por una
firma asimétrica con el par de claves del servidor, generado con OpenSSL. Con
ella, `HMAC-SHA256(K, ·)` pasa a ser `Sign(SK_servidor, ·)`, y la comprobación,
`Verify(PK_servidor, ·, s)`. Una batería de tests de contrato
(`server/test/token-service.contract.js`) garantiza que las dos
implementaciones se comportan igual: ida y vuelta de los claims y rechazo de
tokens manipulados, firmados con otra clave, caducados, de otro emisor, con
otro algoritmo o ilegibles.

### Middleware de autenticación

Toda ruta bajo `/api/private` pasa primero por
`createAuthMiddleware({ tokenService })`:

```text
Cliente                                   Servidor
  | GET /api/private/me                      |
  | Authorization: Bearer t                  |
  | ---------------------------------------> |
  |                       1. t ← cabecera con esquema Bearer
  |                       2. claims ← verify(t)
  |                       3. user ← sessionUserFromClaims(claims)
  |                       4. request.user ← user; siguiente
  |                       GET /me → 200 { email, name, isAdmin }
  | <--------------------------------------- |
```

- Si falta la cabecera, el esquema no es `Bearer` (sin distinguir
  mayúsculas), `verify` rechaza el token o los claims no tienen la forma
  esperada, responde `401` con `{ "error": "No autenticado" }` y la cabecera
  `WWW-Authenticate: Bearer`, sin ejecutar la ruta. La respuesta es la misma
  en todos los casos para no dar pistas a un atacante.
- Si `verify` falla por otro motivo (un error del servidor, no del token), el
  error sigue su curso y acaba en un `500`.
- El middleware está montado antes de cualquier ruta privada: una ruta privada
  que no existe responde `401` sin token y `404` con token.
- Las rutas privadas conocen al usuario y su rol por `request.user`
  (`{ id, email, name, isAdmin }`), sin volver a mirar el token.

### Por qué en la cabecera `Authorization` y no en una cookie

| | Cabecera `Authorization: Bearer` | Cookie `HttpOnly` |
| --- | --- | --- |
| Quién adjunta el token | El código del cliente | El navegador, en toda petición |
| CSRF | No aplica: otro sitio no puede añadir la cabecera | Hay que protegerse con `SameSite` o tokens anti-CSRF |
| XSS | Un script inyectado podría leer el token de memoria | No puede leerlo, pero puede hacer peticiones desde la pestaña |
| Al recargar la página | Se pierde la sesión | Se conserva |

Se ha elegido la cabecera con el token **solo en memoria** del cliente (nunca
en `localStorage`, `sessionStorage` ni cookies): es el transporte estándar de
los JWT (RFC 6750), evita CSRF sin mecanismos adicionales y deja a la vista en
el código cómo se usa el token. El precio es que la sesión se pierde al
recargar la página.

### Uso del token en el cliente

- `client/src/api/session.js` guarda el token en una variable del módulo.
- `apiFetch()` (`client/src/api/http.js`) añade
  `Authorization: Bearer <token>` a las peticiones privadas. Si recibe `401`,
  descarta el token y lanza `SessionExpiredError`, que la interfaz muestra como
  `Tu sesión ha caducado. Vuelve a iniciar sesión.`
- El login no usa `apiFetch`, porque allí un `401` significa credenciales
  incorrectas.

### Lo que este paso no protege

- **Secreto provisional.** Con HMAC, quien conozca `K` puede emitir tokens
  válidos para cualquier usuario. Si `JWT_SECRET` no está definido, `K` es
  aleatorio en cada arranque y los tokens dejan de valer al reiniciar.
- **Sin revocación.** Un token robado, o el de un usuario borrado o cuyo rol
  ha cambiado, sigue siendo válido hasta `exp`. Por eso la caducidad es corta.
- **Token legible en memoria.** Un script inyectado (XSS) podría leerlo
  mientras la pestaña está abierta.
- **Sin control por rol.** `request.user.isAdmin` está disponible, pero
  todavía ningún endpoint lo comprueba (lo añade el paso 3).
- El token viaja sin cifrar por HTTP, igual que la contraseña.

## Panel de administración de usuarios (paso 3)

### Qué añade

Un administrador puede listar, dar de alta, renombrar y eliminar usuarios
desde la aplicación. Las operaciones están en `/api/private/admin/users` y
pasan por **dos** controles seguidos: el middleware de autenticación del
paso 2 (`401` si no hay un token válido) y un middleware de rol (`403` si el
usuario no es administrador).

| Método y ruta | Cuerpo | Respuestas |
| --- | --- | --- |
| `GET /api/private/admin/users` | — | `200 { users: [{ id, name, email, isAdmin }] }` |
| `POST /api/private/admin/users` | `{ name, email, password, isAdmin? }` | `201` usuario creado · `400` · `409` email repetido |
| `PATCH /api/private/admin/users/:id` | `{ name }` | `200` usuario actualizado · `400` · `404` |
| `DELETE /api/private/admin/users/:id` | — | `204` · `400` si es uno mismo · `404` |

Ninguna respuesta incluye la contraseña: todo lo que devuelve el servicio pasa
por `toAdminUser()`, que solo copia `id`, `name`, `email` e `isAdmin`.

### Control de acceso por rol

Sea `t` el token de la petición y `c = Verify(t)` sus claims, ya comprobados
por el middleware de autenticación. El middleware de rol
(`require-admin.js`) permite la operación si y solo si:

```text
c.isAdmin = true  ∧  ∃ u ∈ USER : u.id = c.sub ∧ u.isAdmin = true
```

1. Si `c.isAdmin ≠ true` → `403 { "error": "Acceso denegado" }`, sin consultar
   la base de datos.
2. Si no, se busca el usuario `c.sub` en la tabla `USER`. Si ya no existe o ha
   dejado de ser administrador → `403`, con el mismo cuerpo.
3. Si todo es correcto, la petición sigue hacia la ruta.

**Por qué se consulta la base de datos además del token.** El token no se
puede revocar (paso 2): vale hasta `exp`. El borrado de usuarios crea justo el
caso peligroso, el de un administrador eliminado cuyo token sigue siendo
válido durante una hora. Si solo se mirase el claim `isAdmin`, podría seguir
dando de alta y borrando usuarios. La consulta cuesta una lectura por clave
primaria en SQLite por petición de administración, un precio despreciable para
las operaciones más sensibles de la aplicación.

El rol se comprueba **en el servidor**. Que la interfaz oculte el panel a los
empleados es solo comodidad: un empleado que llame a la API directamente
recibe `403`. El middleware de rol va antes que la lectura del cuerpo JSON, así
que un empleado recibe `403` también si envía un cuerpo ilegible, y no obtiene
información sobre la validación.

### Reglas de negocio y validación

- **Validación** (`user-request.js`), antes de tocar la base de datos. Si algo
  falla, `400 { "error": "Datos de usuario no válidos" }`:
  - `name`: de 1 a 100 caracteres después de quitar los espacios de los
    extremos.
  - `email`: hasta 254 caracteres, exactamente una `@` y texto a ambos lados.
    Se guarda sin espacios y en minúsculas, como en el login.
  - `password`: de 8 a 128 caracteres, tal cual.
  - `isAdmin`: booleano. Si no se envía, vale `false`.
  - Campos no previstos: se rechazan. En el `PATCH` solo se admite `name`,
    así que no se puede usar para subir de rol a nadie.
- **Email único.** El servicio comprueba que el email no exista antes de
  insertar. Si dos altas simultáneas pasan esa comprobación, el índice único
  `user_email_unique` rechaza la segunda, y ese error se traduce al mismo
  `409`.
- **Identificadores.** `:id` solo se acepta si es un entero positivo. Si no lo
  es, se responde `404`, igual que con un id inexistente, para no distinguir
  formatos.
- **Autoeliminación.** Un administrador no puede eliminar su propia cuenta
  (`400`). Como quien borra siempre es un administrador distinto del borrado,
  siempre queda al menos un administrador.

### Panel en el cliente

`UserAdminPanel.jsx` se monta en la vista de sesión solo si el usuario es
administrador. Usa `admin-users.js`, que trabaja sobre `apiFetch`, así que un
`401` lleva al login con el aviso de sesión caducada, como en el paso 2. Un
`403` se traduce en `ForbiddenError`: el panel muestra
`No tienes permiso para gestionar usuarios.` y oculta las acciones. La
confirmación del borrado se hace en la propia fila, sin diálogos del
navegador.

### Lo que este paso no protege

- **El gestor conoce la contraseña inicial**, y se guarda en texto claro como
  el resto (PROVISIONAL). La fase 1 sustituirá el alta directa por una
  invitación en la que el empleado elige su contraseña en el navegador.
- **Un usuario eliminado conserva su token.** Las rutas de administración lo
  rechazan porque consultan la base de datos, pero `GET /api/private/me` sigue
  respondiendo con los datos del token hasta que caduca.
- **El nombre del token puede quedar desactualizado.** Si un administrador
  cambia su propio nombre, `/me` devuelve el nombre antiguo hasta el siguiente
  login, porque sale de los claims.
- **Borrado físico.** No hay desactivación ni histórico. Desde el paso 4, al
  borrar un usuario se borran también las tarjetas de las que es propietario.
- No hay registro de auditoría de quién creó o borró cada cuenta.

## Tabla de tarjetas (paso 4)

### Qué añade

Las tablas en las que se guardan las tarjetas y su relación con los usuarios,
y el repositorio que las maneja. La API y la interfaz las añade el paso 5.

### Modelo de datos

```text
USER (id, ...) 1 ──< USER_CARD (userId, cardId, isOwner, createdAt) >── 1 CARD (id, number, expiryMonth, expiryYear, cvv, createdAt, updatedAt)
```

| Tabla | Columna | Tipo | Notas |
| --- | --- | --- | --- |
| `CARD` | `id` | texto | Clave primaria. UUID v4 generado con `crypto.randomUUID()` |
| `CARD` | `number` | texto | 13–19 dígitos. Texto para no perder ceros ni precisión. **En claro** |
| `CARD` | `expiryMonth`, `expiryYear` | entero | Mes (1–12) y año de cuatro cifras |
| `CARD` | `cvv` | texto | 3 o 4 dígitos. **En claro** |
| `CARD` | `createdAt`, `updatedAt` | texto | ISO 8601 en UTC |
| `USER_CARD` | `userId` | entero | Clave foránea a `USER.id`, `ON DELETE CASCADE` |
| `USER_CARD` | `cardId` | texto | Clave foránea a `CARD.id`, `ON DELETE CASCADE` |
| `USER_CARD` | `isOwner` | booleano | `true` solo para el propietario |
| `USER_CARD` | `createdAt` | texto | ISO 8601 en UTC |

La clave primaria de `USER_CARD` es `(userId, cardId)`, así que un usuario no
puede estar relacionado dos veces con la misma tarjeta. `CARD` no tiene ninguna
columna de propietario: la propiedad es un atributo de la relación.

### Por qué N:N desde ya

En la fase 1 una tarjeta pertenece a un único usuario, pero en la fase 2 los
usuarios podrán compartir tarjetas. Con una tabla de unión desde el principio,
compartir consiste en insertar filas con `isOwner = false`; si se hubiera
puesto `CARD.ownerId`, habría que migrar las tarjetas reales y consultar dos
sitios para saber qué tarjetas ve un usuario. El conjunto de tarjetas que ve
un usuario `u` es siempre:

```text
Tarjetas(u) = { c ∈ CARD : ∃ r ∈ USER_CARD, r.userId = u ∧ r.cardId = c.id }
```

### Reglas de integridad

1. **Un solo propietario por tarjeta**, garantizado por la base de datos con
   un índice único parcial:

   ```sql
   CREATE UNIQUE INDEX user_card_one_owner ON USER_CARD (cardId) WHERE isOwner = 1;
   ```

   Es decir, `∀ c ∈ CARD : |{ r ∈ USER_CARD : r.cardId = c.id ∧ r.isOwner }| ≤ 1`.
   Las filas con `isOwner = false` no están limitadas.
2. **Un solo usuario por tarjeta en la fase 1**, garantizado por la aplicación
   y no por el esquema: el repositorio crea la tarjeta y la relación del
   propietario en una misma transacción y no ofrece ninguna operación para
   relacionar una tarjeta existente con otro usuario. Un índice único sobre
   `cardId` habría que quitarlo en la fase 2, y SQLite no permite borrar
   restricciones sin recrear la tabla.
3. **Integridad referencial.** SQLite ignora las claves foráneas salvo que se
   active `PRAGMA foreign_keys = ON` en cada conexión; se hace en
   `pool.afterCreate` de `knexfile.cjs`, de modo que lo heredan la aplicación,
   las migraciones, los seeds y los tests. Cualquier migración futura que
   recree `USER` o `CARD` tendrá que desactivarlas temporalmente.

### Acceso a las tarjetas

El repositorio (`card-repository.js`) nunca lee una tarjeta suelta: toda
lectura parte de un usuario y pasa por `USER_CARD`, y una tarjeta no
relacionada con él se trata igual que una inexistente. Las escrituras
(`updateForOwner`, `removeForOwner`) exigen además ser el propietario, y lo
comprueban dentro de la propia consulta:

```sql
UPDATE CARD SET ... WHERE id = ? AND id IN (SELECT cardId FROM USER_CARD WHERE userId = ? AND isOwner = 1)
```

Así la regla se cumple aunque la capa de aplicación olvide comprobarla, y no
hay ventana entre la comprobación y la escritura.

Al **eliminar un usuario** (panel del paso 3), `userRepository.remove` borra
en una transacción las tarjetas de las que es propietario y después el
usuario; la cascada elimina sus filas de `USER_CARD`. No quedan tarjetas sin
propietario.

### El CVV se guarda, ignorando PCI DSS

La norma PCI DSS prohíbe almacenar el código de verificación de una tarjeta
después de la autorización. Esta práctica lo guarda a propósito: es un
ejercicio docente para practicar criptografía y seguridad, no un producto
sujeto a cumplimiento normativo, y el objetivo de la aplicación es que el
empleado tenga todos los datos de su tarjeta. En un producto real no sería
admisible. En la fase 1 el CVV se cifrará en el navegador como el resto de
campos, de modo que el servidor nunca lo vea en claro.

### Lo que este paso no protege

- **Número, caducidad y CVV se guardan en texto claro** (PROVISIONAL), igual
  que la contraseña. Cualquiera con acceso al archivo `app.sqlite` los lee.
- No hay cifrado ni integridad de los registros: una modificación directa de
  la base de datos no se detecta.

### Cómo evolucionará

- **Fase 1.** Las columnas de datos de `CARD` se sustituyen por un sobre
  cifrado con AES-GCM (`envelope`, `version`); la clave aleatoria de cada
  tarjeta, envuelta con la clave pública de cada usuario, puede guardarse en
  su fila de `USER_CARD`, una por relación.
- **Fase 2.** Compartir una tarjeta es insertar una fila con
  `isOwner = false` y la clave de la tarjeta envuelta para el nuevo usuario.
  Queda por decidir qué pasa con las tarjetas compartidas cuando se elimina a
  su propietario; hoy se borran.

## Dashboard de tarjetas (paso 5)

### Qué añade

La API `/api/private/cards` y el dashboard **Mis tarjetas** del cliente, con
los que cada usuario da de alta, lista, modifica y elimina **sus** tarjetas.

| Método y ruta | Cuerpo | Respuestas |
| --- | --- | --- |
| `GET /api/private/cards` | — | `200 { cards: [ { id, last4, expiryMonth, expiryYear, createdAt } ] }` |
| `POST /api/private/cards` | `{ number, expiryMonth, expiryYear, cvv }` | `201` tarjeta enmascarada · `400` |
| `PATCH /api/private/cards/:id` | subconjunto no vacío de los cuatro campos | `200` tarjeta enmascarada · `400` · `403` · `404` |
| `DELETE /api/private/cards/:id` | — | `204` · `403` · `404` |

### Control de acceso por relación y por propiedad

El usuario sale siempre del token (`u = c.sub`), nunca del cuerpo ni de la
URL; un campo `userId` en el cuerpo es un error de validación. Las tarjetas
visibles son las del paso 4:

```text
Tarjetas(u) = { c ∈ CARD : ∃ r ∈ USER_CARD, r.userId = u ∧ r.cardId = c.id }
```

Leer exige `c ∈ Tarjetas(u)`; modificar o borrar exige además la propiedad:

```text
Modificar(u, c)  ⇔  ∃ r ∈ USER_CARD : r.userId = u ∧ r.cardId = c ∧ r.isOwner
```

`cardService` aplica para `PATCH` y `DELETE`:

1. El router comprueba que `:id` es un UUID; si no → `404`.
2. `r ← findForUser(id, u)`. Si no hay relación → `404 { "error": "Tarjeta no encontrada" }`.
3. Si `¬ r.isOwner` → `403 { "error": "Acceso denegado" }`, sin escribir.
4. `updateForOwner` / `removeForOwner`, que repiten el filtro por propietario
   en la propia consulta SQL (paso 4). Si no encuentran fila, la tarjeta se
   ha borrado entre medias → `404`.

Una tarjeta ajena, una inexistente y un identificador mal formado dan la misma
respuesta, para no revelar qué identificadores existen. Ser administrador no
amplía `Tarjetas(u)`: el rol solo cuenta en `/api/private/admin`. En la fase 1
toda relación es de propiedad, así que el `403` solo aparece con una relación
compartida (fase 2); los tests lo comprueban insertando esa relación a mano.

### Validación

`card-request.js` comprueba cada cuerpo y responde siempre
`400 { "error": "Datos de tarjeta no válidos" }`, sin indicar qué campo ha
fallado (el detalle por campo lo da el cliente):

- `number`: texto; sin espacios ni guiones debe tener de 13 a 19 dígitos y
  superar la comprobación de Luhn: duplicando cada segundo dígito desde la
  derecha (restando 9 si pasa de 9), la suma de todos los dígitos es múltiplo
  de 10. Luhn no es una medida de seguridad: solo detecta errores de tecleo.
- `expiryMonth ∈ [1, 12]` y `expiryYear` entero con
  `año(hoy) ≤ expiryYear ≤ año(hoy) + 20`.
- Caducidad: válida si `(expiryYear, expiryMonth) ≥ (año(hoy), mes(hoy))` en
  orden lexicográfico, porque una tarjeta vale hasta el último día de su mes.
- `cvv`: 3 o 4 dígitos (las Amex usan 4).
- En el alta, los cuatro campos son obligatorios; en la modificación, al menos
  uno, y el mes y el año siempre juntos. Cualquier otro campo se rechaza.

El cliente (`client/src/validation/card.js`) aplica las mismas reglas para
mostrar el error junto al campo sin enviar la petición. Las dos
implementaciones se prueban con la misma tabla de números de prueba.

### Minimización: lo que nunca sale del servidor

Todo lo que devuelve `cardService` pasa por `toMaskedCard`, que solo conserva
`id`, `last4` (los 4 últimos dígitos), la caducidad y la fecha de alta. El
número completo y el CVV entran por la API pero no vuelven a salir. Por eso
la modificación es **parcial** (`PATCH`): el formulario de edición rellena la
caducidad y deja el número y el CVV vacíos ("vacío = no cambiar"), y el
cliente envía solo los campos modificados. Con un `PUT` que sustituyese los
cuatro campos habría que volver a teclearlo todo o devolver los datos al
cliente.

En el cliente, los datos solo viven en el estado de React: no se escriben en
la consola ni en `localStorage`/`sessionStorage`, el CVV usa un campo de tipo
contraseña y se borra del estado tras cada envío.

### Lo que este paso no protege

- **Número, caducidad y CVV se guardan en texto claro** (PROVISIONAL): con
  acceso a `app.sqlite` se ven. Desde el paso 6 ya no viajan en claro por la
  red, pero el servidor los recibe y los ve.
- **Se guarda el CVV**, ignorando PCI DSS (ver el paso 4).
- **Borrado físico**: una tarjeta eliminada no se puede recuperar.
- La fase 1 cambiará el modelo: el cliente cifrará la tarjeta completa antes
  de enviarla y el servidor no podrá enmascararla ni aplicar cambios
  parciales; descifrar, modificar y volver a cifrar con una clave nueva lo
  hará el navegador.

## Cifrado del canal (paso 6)

### Qué añade

Hasta el paso 5, todo el tráfico iba por HTTP: la contraseña, el token y los
datos de las tarjetas viajaban en claro. Desde el paso 6, los dos tramos de
red van cifrados con TLS, y cada parte tiene su propio certificado X.509
autofirmado:

```
Navegador ──TLS──► Cliente C (Vite, :5173) ──TLS──► Servidor S (API, :3000)
                   Cert_C (OU=Cliente web)          Cert_S (OU=API)
```

- **No hay alternativa HTTP.** Ni el cliente ni el servidor abren un puerto
  HTTP. Una conexión HTTP en claro al puerto 3000 se corta en el handshake
  TLS y no llega a Express.
- **Sin certificado, no se arranca.** `createHttpsServer`
  (`server/src/infrastructure/http/https-server.js`) y `client/vite.config.js`
  lanzan un error si falta el certificado, si falta la clave o si la clave no
  corresponde al certificado. El mensaje pide ejecutar `npm run cert`. Así no
  se puede acabar sirviendo por HTTP sin querer.
- **El proxy verifica al servidor.** El proxy de Vite usa `Cert_S` como única
  autoridad de confianza (`ca`) y no desactiva la verificación (no hay
  `secure: false`). Si el servidor presentara otro certificado, el proxy
  rechazaría la conexión.

El procedimiento completo (comandos, instalación en el navegador y problemas
frecuentes) está en [certificados autofirmados](certificados-autofirmados.md).

### Notación

Se sigue la notación de los temas 1 a 4 de la asignatura.

| Símbolo | Significado |
|---|---|
| `X ∈ {C, S}` | Parte: cliente (Vite) o servidor (API). |
| `p_X, q_X` | Primos grandes, secretos, elegidos al azar por OpenSSL. |
| `n_X = p_X · q_X` | Módulo RSA de 2048 bits. |
| `e_X = 65537` | Exponente público, con `mcd(e_X, Φ(n_X)) = 1`. |
| `d_X` | Exponente privado: `d_X · e_X mod Φ(n_X) = 1`. |
| `K_X = (n_X, e_X)` | Clave pública de X. Va dentro del certificado. |
| `k_X = d_X` | Clave privada de X. Fichero `key.pem`. |
| `H` | Función resumen SHA-256. |
| `tbs_X` | Contenido del certificado que se firma: sujeto, emisor, validez, `K_X` y extensiones. |
| `Cert_X` | Certificado de X: `(tbs_X, σ_X)`. Fichero `cert.pem`. |

### Generación de las claves y del certificado

`npm run cert` (`scripts/generar-certificados.mjs`) ejecuta para cada parte X
un único `openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes …`, que:

1. Genera el par de claves RSA de X: elige `p_X` y `q_X`, calcula
   `n_X = p_X · q_X`, `Φ(n_X) = (p_X − 1)(q_X − 1)`, toma `e_X = 65537` y
   calcula `d_X = e_X⁻¹ mod Φ(n_X)`. Resultado: `K_X = (n_X, e_X)` y
   `k_X = d_X`.
2. Construye `tbs_X` con el sujeto `CN=localhost, O=Tarjetas de empresa,
   OU=<API | Cliente web>`, el emisor igual al sujeto (autofirmado), la
   validez de 365 días, `K_X` y las extensiones.
3. Lo **firma con su propia clave privada**:
   `σ_X = D_k_X(H(tbs_X)) = H(tbs_X)^d_X mod n_X`, en el sentido de
   autentificación del tema 4 (`r = DkA(m)`). En la práctica, OpenSSL aplica
   antes al resumen el relleno PKCS#1 v1.5.
4. Guarda `Cert_X = (tbs_X, σ_X)` en `cert.pem` y `k_X` en `key.pem`, sin
   cifrar (`-nodes`) y con permisos `0600` en Linux.

Cualquiera que tenga `Cert_X` puede comprobar la firma:
`E_K_X(σ_X) = σ_X^e_X mod n_X = H(tbs_X)`. Como el emisor es el propio X, esa
comprobación solo demuestra que el certificado no se ha modificado y que lo
firmó quien tiene `k_X`. No demuestra quién es X. Por eso la confianza hay que
establecerla fuera de banda: el proxy recibe `Cert_S` directamente del disco,
y el usuario compara la huella `H(Cert_C)` que muestra `npm run cert` con la
que enseña el navegador.

`k_C` y `k_S` son independientes: si se filtra una, la otra sigue protegida.

### Parámetros y justificación

El equipo ha confirmado estos parámetros.

| Parámetro | Valor | Justificación |
|---|---|---|
| Algoritmo de clave pública | RSA, `n` de 2048 bits | Es el criptosistema del tema 4. Su seguridad descansa en la dificultad de factorizar `n` sin conocer `p` y `q`. 2048 bits es el mínimo aceptado hoy. |
| Exponente público | `e = 65537 = 2¹⁶ + 1` | Es el valor por defecto de OpenSSL. Es primo, así que `mcd(e, Φ(n)) = 1` salvo casos triviales, y permite cifrar y verificar firmas deprisa. |
| Resumen de la firma | SHA-256 | El certificado se firma con `sha256WithRSAEncryption`. SHA-1 ya no se acepta. |
| Validez | 365 días | Limita cuánto tiempo sirve una clave filtrada. Los navegadores rechazan validez más larga. |
| `subjectAltName` | `localhost`, `127.0.0.1` y `::1` | Los navegadores solo comprueban el SAN, no el `CN`. |
| `basicConstraints` | `critical, CA:FALSE` | Es un certificado final: no puede firmar otros certificados. |
| `keyUsage` | `critical, digitalSignature, keyEncipherment` | Los usos que necesita TLS con RSA. |
| `extendedKeyUsage` | `serverAuth` | Solo sirve para identificar a un servidor TLS. |

### Qué protege TLS en este caso

Durante el handshake, el servidor (Vite ante el navegador, o la API ante el
proxy) demuestra que tiene `k_X` firmando datos de la conexión. El cliente lo
comprueba con `K_X`, sacada del certificado en el que confía. Después, las
dos partes acuerdan una **clave de sesión simétrica** con la que cifran y
autentican todo el tráfico, normalmente con AES-GCM. Es el esquema híbrido del
tema 4: la criptografía asimétrica solo se usa para autenticar y acordar la
clave de sesión.

Contra un observador de la red, TLS da:

- **Confidencialidad:** la contraseña, el token y las tarjetas viajan cifrados.
- **Integridad:** cualquier modificación en tránsito se detecta.
- **Autenticidad del servidor:** el navegador y el proxy solo hablan con quien
  tiene `k_C` y `k_S`.

### Lo que este paso no protege

- **Los datos llegan en claro al servidor.** TLS protege el transporte, no el
  almacenamiento: el servidor sigue viendo y guardando la contraseña y las
  tarjetas en claro. Lo resolverá el cifrado en el navegador de la fase 1.
- **La confianza en un certificado autofirmado depende del usuario.** Si
  acepta el aviso del navegador sin comprobar la huella, no detectaría a un
  atacante que presentara otro certificado.
- **Las claves privadas se guardan sin cifrar.** Las protegen los permisos
  del fichero y quedan fuera de git. Cifrarlas con una frase de paso es una
  mejora pendiente.
- **El servidor no autentica al cliente.** Cualquiera que llegue al puerto
  3000 y confíe en `Cert_S` puede hablar con la API. La autenticación mutua
  TLS lo resolvería, pero de momento el equipo la ha dejado de lado.
- **Sin cabeceras de seguridad** (HSTS, CSP…). Quedan para otro paso de la
  fase 1.

## Trabajo futuro

- Sustituir la firma provisional del token por la firma asimétrica del
  servidor (equipo).
- Revocar o renovar los tokens, para poder cerrar sesión en el servidor.
- Autenticación mutua TLS entre el proxy de Vite y la API, con el
  certificado del cliente (descartada por ahora; se puede retomar).
- Cifrar las claves privadas de los certificados con una frase de paso y
  añadir las cabeceras de seguridad (HSTS, CSP…).
- Almacenar las contraseñas con una función de hash adecuada para contraseñas,
  con sal (la librería concreta está pendiente de decidir; ver
  [Stack tecnológico](stack-tecnologico.md)), en lugar de en texto claro.
- Decidir si la sesión debe sobrevivir a una recarga de la página (por
  ejemplo, pasando el token a una cookie `HttpOnly`, `Secure` y `SameSite`).
- Responder con el mismo error y en un tiempo similar tanto si el email no
  existe como si la contraseña es incorrecta.
- Limitar los intentos de login fallidos para dificultar ataques de fuerza
  bruta.
- Extender el control de acceso por rol a los endpoints que vengan (tarjetas,
  contratos) y decidir si la comprobación contra la base de datos del paso 3
  se aplica a toda la sección privada, para que un usuario eliminado pierda el
  acceso en cuanto se le borra.
- Sustituir el alta con contraseña inicial por la invitación de la fase 1 y
  añadir la desactivación de cuentas y un registro de auditoría.
- Cifrar los datos de las tarjetas en el navegador (fase 1) y compartir
  tarjetas entre usuarios (fase 2), decidiendo qué pasa con las tarjetas
  compartidas de un propietario eliminado.
