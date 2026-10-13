# Diseño: paso 2 — middleware de autenticación con JWT

## Context

- El paso 1 deja un servidor por capas en `server/src/` (dominio, aplicación,
  infraestructura HTTP y base de datos), `createApp({ authService, notesStore })`
  con inyección por fábricas y tests con `node:test`. `POST /api/public/login`
  responde `200 { email, name, isAdmin }` y no deja ninguna sesión.
- El cliente guarda el usuario en el estado de React (`App.jsx`) y `logout()`
  es local. Vite reenvía `/api` al servidor, así que el navegador habla con un
  solo origen.
- Las notas de clase piden un middleware estructurado de autenticación y
  mencionan OpenSSL para el material de claves del servidor.
- `openspec/config.yaml` asigna al equipo las primitivas y protocolos
  criptográficos (entre ellos la firma) y a Claude el resto, programando
  contra interfaces con implementaciones provisionales marcadas.
- La propuesta `fase-1-registro-y-cifrado` preveía una sesión con cookie
  `HttpOnly` y un identificador aleatorio guardado en el servidor. Este paso
  toma otra decisión (ver D1) y lo deja anotado para cuando se retome.
- Los requisitos están en `specs/sesion-jwt/spec.md` y en el delta de
  `specs/autenticacion/spec.md`.

## Goals / Non-Goals

**Goals:**

- Un único punto de autenticación (el middleware) por el que pasa toda la
  sección privada, probado de forma aislada y de extremo a extremo.
- Separar con una interfaz lo que es capa de seguridad (firmar y verificar)
  de lo que no lo es (leer la cabecera, decidir el 401, poblar `request.user`).
- Que el cliente use el token de la forma más simple que no empeore la
  seguridad: en memoria y en una cabecera.
- Dejar el formato del token y el flujo de verificación descritos con
  notación inequívoca para la memoria.

**Non-Goals:**

- Revocación, lista negra, *refresh tokens* o cierre de sesión en el servidor.
- Persistir la sesión al recargar la página.
- Guardas por rol (`403`): `request.user.isAdmin` queda disponible, pero
  ningún endpoint de este paso lo necesita.
- HTTPS, cabeceras de seguridad, límite de intentos, hash de contraseñas.
- Mover `notes` a la sección privada (se retirará más adelante).

## Decisions

### D1. El token viaja en `Authorization: Bearer`, no en una cookie

Las dos opciones razonables son:

| | Cabecera `Authorization: Bearer` | Cookie `HttpOnly` |
| --- | --- | --- |
| Quién adjunta el token | El código del cliente, explícitamente | El navegador, en toda petición al origen |
| CSRF | Inmune: un sitio ajeno no puede añadir la cabecera | Hay que añadir `SameSite` y, en general, un token anti-CSRF |
| XSS | Un script inyectado podría leer el token de memoria mientras la pestaña está abierta | Un script inyectado no lee la cookie, pero puede hacer peticiones autenticadas desde la pestaña igualmente |
| Persistencia al recargar | No, salvo que se guarde en `localStorage` (descartado por XSS) | Sí |
| Pruebas | `fetch` y `curl` con una cabecera; sin *cookie jar* | Cookie jar en tests y en `curl` |
| Visibilidad didáctica | El flujo se ve en el código del cliente y en la cabecera | El navegador lo oculta |

Se elige la **cabecera `Authorization: Bearer`** con el token **solo en
memoria del cliente**. Razones: es el transporte estándar de JWT (RFC 6750);
evita CSRF sin añadir mecanismos; se prueba con `fetch` sin cookies; hace
visible en el código del cliente cómo se usa el token, que es lo que la
memoria debe explicar; y encaja con los pasos siguientes, en los que el
cliente firmará retos y hablará con la API como un cliente de API, no como un
formulario. El precio es que al recargar la página se pierde la sesión, que
ya era el comportamiento del paso 1 y se mantiene a propósito hasta que se
diseñe la renovación del token. Ante XSS, ninguna de las dos opciones protege
de un script que actúe desde la pestaña; la defensa real es evitar XSS y
mantener corta la caducidad.

Alternativa descartada: cookie `HttpOnly` + `SameSite=Strict` con el JWT
dentro. Sería válida y es lo que preveía `fase-1`, pero obliga a añadir CSRF
y cookies a los tests ahora, y oculta al alumno el mecanismo que se está
estudiando. Si más adelante se quiere persistencia al recargar, se puede
pasar a cookie cambiando solo el middleware (de dónde lee el token) y
`client/src/api/http.js`, sin tocar el servicio de tokens.

### D2. Qué parte es capa de seguridad del equipo

La **firma y la verificación criptográfica** del token (algoritmo, generación
y custodia de las claves, `sign`/`verify`) son capa de seguridad: es "firma"
en la lista de `config.yaml` y es la forma en que el servidor demuestra que él
emitió el token, que enlaza con la "autenticación de servidor" del enunciado.
Las asume el **equipo**.

Todo lo demás es de **Claude**: el formato de los *claims*, la política de
caducidad, el middleware (parseo de la cabecera, `401`, `request.user`), el
router privado, la integración en `createApp` e `index.js`, el cliente, los
tests de integración y los tests de contrato del servicio de tokens.

Para que ambos avancen en paralelo, Claude entrega una **implementación
provisional** del servicio de tokens con `jose` (ver D4) y HS256 con un
secreto del entorno, marcada `PROVISIONAL`, que pasa los tests de contrato.
El equipo la sustituye por una firma **asimétrica** con el par de claves del
servidor (EdDSA/Ed25519 o ES256; la elección es suya) generado con OpenSSL,
sin tocar nada fuera de `server/src/infrastructure/security/`. La batería de
contrato es la misma para las dos.

Alternativa descartada: que Claude cierre también la firma definitiva. Iría
contra el reparto acordado y dejaría al equipo sin la pieza que más se parece
a lo que exige la asignatura.

### D3. Formato del token y *claims*

Token = JWT compacto (RFC 7519): `base64url(cabecera) . base64url(claims) .
base64url(firma)`.

- Cabecera: `{ "alg": <algoritmo configurado>, "typ": "JWT" }`.
- *Claims*:

| Claim | Valor | Para qué |
| --- | --- | --- |
| `sub` | `String(user.id)` | Identificar al usuario |
| `email` | email del usuario | Mostrar y auditar sin consultar la base de datos |
| `name` | nombre del usuario | Que `/me` no necesite la base de datos |
| `isAdmin` | booleano | Rol |
| `iss` | `"tarjetas-de-empresa"` | Rechazar tokens emitidos por otra aplicación con la misma clave |
| `iat` | segundos UNIX de emisión | Trazabilidad |
| `exp` | `iat + ttlSeconds` | Caducidad |

- Tiempo de vida: `ttlSeconds`, por defecto 3600 (1 hora), configurable con
  la variable de entorno `JWT_TTL_SECONDS` (útil para probar la caducidad en
  el navegador con un valor pequeño).
- La verificación comprueba, en este orden: formato, algoritmo admitido
  (lista fija, nunca el `alg` que diga el token), firma, `iss` y `exp` con el
  reloj del servidor, sin tolerancia (`clockTolerance: 0`), para que los tests
  de caducidad sean deterministas.

El token es **sin estado**: el servidor no guarda nada por sesión y confía en
los *claims* mientras la firma y `exp` sean válidos. Consecuencia asumida: si
se cambia el rol o se borra al usuario, su token sigue valiendo hasta `exp`.
Por eso `ttl` es corto y la revocación queda para un paso posterior.

Alternativa descartada: *claims* mínimos (`sub` y `exp`) y consulta a la base
de datos en cada petición privada. Resuelve lo anterior, pero convierte el
middleware en dependiente del repositorio y desdibuja la lección de que el
JWT es una afirmación firmada y autosuficiente.

### D4. Módulos nuevos y modificados en el servidor

```text
server/
├── index.js                                   # Lee la configuración y conecta tokenService
└── src/
    ├── app.js                                 # createApp({ authService, tokenService, notesStore })
    ├── config.js                              # loadConfig(env): secreto, ttl, puerto
    ├── domain/
    │   ├── user.js                            # toPublicUser(user) (sin cambios)
    │   └── session.js                         # toSessionClaims(user), sessionUserFromClaims(claims)
    ├── application/
    │   ├── auth-service.js                    # login() → { token, user }
    │   └── errors.js                          # + InvalidTokenError
    └── infrastructure/
        ├── security/
        │   ├── README.md                      # Contrato de createTokenService y reparto equipo/claude
        │   └── token-service.js               # PROVISIONAL: HS256 con jose; el equipo lo sustituye
        └── http/
            ├── auth-middleware.js             # createAuthMiddleware({ tokenService })
            ├── private-router.js              # /api/private: router.use(authMiddleware) + GET /me
            └── public-router.js               # login responde { token, user }
```

- **`createTokenService({ secret, ttlSeconds, issuer, now })`** devuelve
  `{ sign(claims), verify(token) }`, ambas asíncronas. `sign` añade `iss`,
  `iat` y `exp` a partir de `now()`; `verify` devuelve los *claims* o lanza
  `InvalidTokenError`. `now` se inyecta solo para los tests (emitir un token
  ya caducado sin esperar).
- **`jose`** (v6, sin dependencias, ESM, usa WebCrypto de Node) como librería
  JWT. Alternativa descartada: `jsonwebtoken`, más antigua y CommonJS.
  Alternativa descartada: implementar el JWT a mano con `node:crypto` en la
  versión provisional; es poco código, pero un error ahí se confunde con el
  trabajo del equipo. El equipo puede usar `jose` con un algoritmo asimétrico
  o `node:crypto` directamente, a su elección.
- **Secreto provisional**: `JWT_SECRET` (mínimo 32 caracteres) del entorno.
  Si no está definido, `loadConfig` genera 32 bytes aleatorios y escribe un
  aviso en consola: los tokens dejan de valer al reiniciar el servidor
  (incluido el reinicio de `node --watch`). Así `npm run dev` funciona sin
  configuración en Windows y Linux, y no hay secreto por defecto en el
  repositorio.
- **`domain/session.js`**: `toSessionClaims(user)` →
  `{ sub, email, name, isAdmin }`; `sessionUserFromClaims(claims)` valida la
  forma (`sub` numérico en texto, `email` y `name` cadenas, `isAdmin`
  booleano) y devuelve `{ id, email, name, isAdmin }` o `null`.
- **`auth-service.js`**: `createAuthService({ userRepository, tokenService })`.
  `login()` conserva la comparación provisional del paso 1 y devuelve
  `{ token: await tokenService.sign(toSessionClaims(user)), user: toPublicUser(user) }`.
  Emitir el token es parte del caso de uso "iniciar sesión", por eso está en
  aplicación y no en el router.
- **`auth-middleware.js`**: `createAuthMiddleware({ tokenService })` devuelve
  `async (request, response, next)`:
  1. Lee `request.headers.authorization` y la casa con `/^Bearer\s+(\S+)$/i`.
     Si no casa → `401`.
  2. `tokenService.verify(token)`; `InvalidTokenError` → `401`; cualquier
     otro error → `next(error)` (acaba en `500`).
  3. `sessionUserFromClaims(claims)`; `null` → `401`.
  4. `request.user = sessionUser; next()`.

  El `401` siempre lleva `WWW-Authenticate: Bearer` (RFC 6750) y el cuerpo
  `{ "error": "No autenticado" }`. No se distingue la causa: la distinción
  solo ayudaría a un atacante y el cliente reacciona igual en todos los casos.
- **`private-router.js`**: `createPrivateRouter({ authMiddleware })`; monta
  el middleware antes de cualquier ruta, de modo que una ruta inexistente sin
  token responde `401` y con token `404`. `GET /me` responde
  `toPublicUser(request.user)`.
- **`app.js`**: `createApp({ authService, tokenService, notesStore })` crea
  el middleware y monta `/api/private`. Los tests construyen un
  `tokenService` con `ttlSeconds` o `now` a medida.
- **`index.js`**: `const config = loadConfig(process.env)`; crea
  `tokenService` y lo inyecta en `authService` y `createApp`.

### D5. Flujo de una petición privada

```text
Cliente                              Servidor
  |  GET /api/private/me                 |
  |  Authorization: Bearer t             |
  | -----------------------------------> |
  |                          authMiddleware:
  |                            t = cabecera ∖ "Bearer "
  |                            claims = verify(t)      # firma, alg, iss, exp
  |                            request.user = sessionUserFromClaims(claims)
  |                          GET /me → 200 toPublicUser(request.user)
  | <----------------------------------- |
```

Notación para la memoria (implementación provisional):

```text
h  = base64url({ "alg": "HS256", "typ": "JWT" })
p  = base64url({ sub, email, name, isAdmin, iss, iat, exp })
t  = h || "." || p || "." || base64url(HMAC-SHA256(K, h || "." || p))
```

Verificación: separar `t` en `(h, p, s)`; comprobar que `alg(h)` está en la
lista admitida; recalcular `HMAC-SHA256(K, h || "." || p)` y compararlo con
`s` en tiempo constante; comprobar `iss(p)` y `exp(p) > ahora`. Con la
implementación del equipo, `HMAC-SHA256(K, ·)` pasa a ser
`Sign(SK_servidor, ·)` y la comprobación `Verify(PK_servidor, ·, s)`.

### D6. Cliente

```text
client/src/
├── api/
│   ├── session.js      # Token en memoria: setToken, getToken, clearToken
│   ├── http.js         # apiFetch(path, options): añade Authorization; 401 → SessionExpiredError
│   └── auth.js         # login() guarda el token; logout() lo borra; getCurrentUser() → GET /api/private/me
├── App.jsx             # Estado user + aviso de sesión caducada
└── components/
    ├── LoginForm.jsx   # Prop `notice` para mostrar el aviso en el área de alerta
    └── SessionView.jsx # Al montarse llama a getCurrentUser() y muestra name y email
```

- El token vive en una variable del módulo `session.js`. Nunca se escribe en
  `localStorage`, `sessionStorage` ni cookies.
- `apiFetch` añade `Authorization: Bearer <token>` si hay token. Si la
  respuesta es `401`, borra el token y lanza `SessionExpiredError` con el
  mensaje `Tu sesión ha caducado. Vuelve a iniciar sesión.`. `login()` no usa
  `apiFetch`: su `401` significa otra cosa.
- `SessionView` llama a `getCurrentUser()` al montarse y cada vez que la
  ventana recupera el foco (evento `focus` de `window`), y muestra el `name`
  devuelto por el servidor; así la pantalla demuestra que la sección privada
  funciona y una sesión caducada se detecta al volver a la pestaña sin añadir
  botones. Ante `SessionExpiredError` avisa a `App` (`onSessionExpired`), que
  pone `user` a `null` y pasa el aviso a `LoginForm`.
- `logout()` solo borra el token (no hay nada que cerrar en el servidor) y
  `App` vuelve al login sin aviso.

### D7. Tests

- `test/token-service.contract.js`: exporta
  `runTokenServiceContractTests(createService)` con los casos del requisito
  "Contrato del servicio de tokens" (ida y vuelta, manipulado, firma ajena,
  caducado, `alg: none`, ilegible). `createService({ now, ttlSeconds })` lo
  aporta cada implementación.
- `test/token-service.test.js`: ejecuta el contrato con la implementación
  provisional. El equipo añade el suyo con el mismo *helper*.
- `test/auth-middleware.test.js`: unitario con `request`/`response`/`next`
  simulados y un `tokenService` falso: cabecera ausente, esquema distinto,
  `bearer` en minúsculas, `verify` que lanza `InvalidTokenError`, `verify`
  que lanza otro error (debe llamar a `next(error)`), *claims* incompletos y
  caso correcto (`request.user` poblado y `next()` sin argumentos).
- `test/private-me.test.js`: integración con `createApp` sobre una base de
  datos temporal: login → `/me` (empleado y administrador), sin cabecera,
  token manipulado, firmado con otro secreto, caducado (servicio con `now` en
  el pasado solo para firmar), `alg: none`, ruta inexistente con y sin token,
  cuerpo y cabecera del `401`, y que `/api/health` y el login siguen sin
  pedir token.
- Se actualizan `test/auth-service.test.js` (con un `tokenService` falso) y
  `test/public-login.test.js` al nuevo cuerpo `{ token, user }`.

El cliente se comprueba a mano en el navegador: login, nombre en la vista de
sesión, recarga, cierre de sesión y caducidad con `JWT_TTL_SECONDS=5`.

## Risks / Trade-offs

- [Token sin revocación: un token robado o de un usuario borrado vale hasta
  `exp`] → Caducidad de 1 hora por defecto; la revocación o renovación se
  diseña en un paso posterior. Se documenta en la memoria.
- [Token en memoria del cliente, legible por un script inyectado] → No se
  persiste en almacenamiento del navegador; caducidad corta; la defensa
  frente a XSS (CSP, escapado) es un paso posterior. La cookie no evitaría que
  ese mismo script actuara desde la pestaña.
- [Secreto HMAC provisional: cualquiera que lo conozca emite tokens válidos]
  → Marcado `PROVISIONAL`; el equipo lo sustituye por firma asimétrica. Sin
  `JWT_SECRET`, el secreto es aleatorio por proceso y nunca sale del código.
- [Reinicio de `node --watch` invalida los tokens cuando no hay `JWT_SECRET`]
  → Aviso en consola y en el README; para desarrollo prolongado basta con
  definir `JWT_SECRET`.
- [Confusión de algoritmo (`alg: none`, HS256 con clave pública)] → La lista
  de algoritmos admitidos es fija en `verify`; test de contrato explícito.
- [Divergencia con `fase-1`, que preveía cookie] → Anotado en la propuesta;
  al retomar `fase-1` se reescribe su requisito "Sesión" sobre `sesion-jwt`.
- [Nueva dependencia `jose`] → Sin dependencias transitivas, mantenida y
  usada por la implementación provisional; el equipo puede prescindir de
  ella.

## Migration Plan

1. `paso-1-login-texto-claro` ya está archivado; este cambio parte de él.
2. `npm install` (añade `jose` al workspace del servidor).
3. Opcional: `JWT_SECRET` y `JWT_TTL_SECONDS` en el entorno (o en un `.env`
   si se adopta `--env-file`; no es necesario para desarrollar).
4. `npm run dev`, iniciar sesión y comprobar que la vista de sesión muestra el
   nombre devuelto por `/api/private/me`.
5. Para deshacerlo: volver al commit anterior; no hay migraciones de base de
   datos.

## Open Questions

- Ninguna bloqueante. Dos decisiones que el usuario puede querer revisar:
  (1) cabecera `Bearer` en memoria frente a cookie `HttpOnly` (D1); (2) que la
  firma del token sea del equipo (D2). Ambas están aisladas: cambiar la
  primera toca el middleware y `http.js`; cambiar la segunda solo mueve
  etiquetas en `tasks.md`.
