# Implementación y seguridad

Este documento describe cómo está organizado el código y qué medidas de
seguridad se aplican en cada parte. El trabajo avanza en pasos pequeños:

- **Paso 1:** login de extremo a extremo **sin ninguna medida de seguridad**.
  La contraseña viaja y se guarda en texto claro.
- **Paso 2:** sesión con un token JWT y un middleware de autenticación que
  protege la sección privada de la API. La firma del token es todavía
  **provisional** (HMAC con un secreto compartido).

Es la base sobre la que los pasos siguientes añadirán la criptografía; no es el
diseño final.

## Estructura del proyecto

El proyecto es un repositorio único con dos paquetes gestionados mediante
**npm workspaces** desde la raíz:

```text
.
├── package.json              # Define los workspaces y los scripts comunes (dev, build...)
├── client/                   # Frontend: Vite + React (JavaScript)
│   ├── index.html            # Página única; monta la aplicación en #root
│   ├── vite.config.js        # Plugin de React y proxy de /api hacia el servidor
│   └── src/
│       ├── main.jsx          # Punto de entrada: renderiza <App />
│       ├── App.jsx           # Decide si mostrar el login o la sesión iniciada
│       ├── style.css
│       ├── api/
│       │   ├── auth.js       # login(), getCurrentUser() y logout()
│       │   ├── http.js       # apiFetch(): añade el token; 401 → sesión caducada
│       │   └── session.js    # Token de sesión, solo en memoria
│       └── components/
│           ├── LoginForm.jsx    # Formulario de email y contraseña
│           └── SessionView.jsx  # Vista de sesión: datos de /api/private/me
└── server/                   # Backend: Node.js + Express + Knex + SQLite
    ├── index.js              # Arranque: construye las dependencias y escucha el puerto
    ├── knexfile.cjs
    ├── migrations/           # Migraciones de Knex (tabla USER)
    ├── seeds/                # Usuarios de prueba para desarrollo
    ├── test/                 # Tests con node:test
    └── src/
        ├── app.js            # createApp(): monta los routers y el manejo de errores
        ├── config.js         # loadConfig(): puerto, secreto y caducidad del token
        ├── domain/
        │   ├── user.js       # toPublicUser(): datos del usuario sin contraseña
        │   └── session.js    # Claims del token ↔ usuario de la sesión
        ├── application/
        │   ├── auth-service.js  # Servicio de autenticación: login() → { token, user }
        │   └── errors.js        # InvalidCredentialsError, InvalidTokenError
        └── infrastructure/
            ├── database/
            │   ├── knex.js              # Conexión de Knex
            │   └── user-repository.js   # findByEmail(email)
            ├── security/
            │   ├── README.md            # Contrato del servicio de tokens (equipo/Claude)
            │   ├── issuer.js            # Valor del claim iss
            │   └── token-service.js     # PROVISIONAL: firma y verificación HS256
            └── http/
                ├── public-router.js     # /api/public (sin sesión)
                ├── private-router.js    # /api/private (con sesión)
                ├── auth-middleware.js   # Middleware de autenticación
                └── login-request.js     # Validación de la petición de login
```

`npm run dev` en la raíz arranca a la vez el cliente (Vite, puerto 5173) y el
servidor (Express, puerto 3000). En desarrollo, el proxy de Vite reenvía las
peticiones a `/api` al servidor, así que el navegador solo habla con un origen.

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
  lectores de pantalla anuncien el cambio.

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
  todavía ningún endpoint lo comprueba.
- El token viaja sin cifrar por HTTP, igual que la contraseña.

## Trabajo futuro

- Sustituir la firma provisional del token por la firma asimétrica del
  servidor (equipo).
- Revocar o renovar los tokens, para poder cerrar sesión en el servidor.
- Cifrar el canal (HTTPS) para que la contraseña no viaje en claro.
- Almacenar las contraseñas con una función de hash adecuada para contraseñas,
  con sal (la librería concreta está pendiente de decidir; ver
  [Stack tecnológico](stack-tecnologico.md)), en lugar de en texto claro.
- Decidir si la sesión debe sobrevivir a una recarga de la página (por
  ejemplo, pasando el token a una cookie `HttpOnly`, `Secure` y `SameSite`).
- Responder con el mismo error y en un tiempo similar tanto si el email no
  existe como si la contraseña es incorrecta.
- Limitar los intentos de login fallidos para dificultar ataques de fuerza
  bruta.
- Control de acceso por rol (gestor / empleado) en cada endpoint, a partir de
  `request.user.isAdmin`, y en la interfaz, que hoy no distingue roles.
