# Diseño

## Context

Ver `proposal.md` (Why) y las especificaciones en `specs/`. Estado actual:

- `client/`: Vite + React con una vista de login simulada (`client/src/api/auth.js`).
- `server/`: Express 5 + Knex + better-sqlite3, con un recurso de demostración
  `notes` y una tabla `USER` (`name`, `email`, `isAdmin`) sin material
  criptográfico ni clave primaria.
- Restricciones: JavaScript sin TypeScript, ejecución en Windows y Linux, y
  un reparto del trabajo en el que el equipo implementa la capa de seguridad y
  Claude el resto.

## Goals / Non-Goals

**Goals:**

- Fijar una **frontera estable** entre la capa de seguridad y el resto del
  código, para que el equipo y Claude trabajen en paralelo sin bloquearse.
- Proponer algoritmos, formatos y un protocolo concretos como punto de partida
  que el equipo pueda aceptar o cambiar sin tocar la interfaz.
- Usar solo criptografía nativa: Web Crypto en el navegador y `node:crypto` en
  el servidor.

**Non-Goals:**

- Protegerse de un servidor malicioso que sirva JavaScript alterado. Es una
  limitación inherente al cifrado de extremo a extremo en aplicaciones web; se
  documenta como mejora futura.
- Recuperar la cuenta si se olvida la contraseña: sin la contraseña las
  tarjetas son irrecuperables, por diseño.
- Compartir tarjetas, las tarjetas y contratos de empresa y la rotación de
  claves (fase 2). El formato de los registros sí debe permitir más adelante
  varias claves envueltas por registro.

## Decisions

### D1. Frontera de la capa de seguridad

Toda la criptografía vive en dos módulos que **solo toca el equipo**:

- `client/src/security/`: capa criptográfica del navegador.
- `server/security/`: capa criptográfica del servidor.

El resto del código solo importa sus `index.js` y no usa `crypto.subtle` ni
`node:crypto` directamente. Interfaz acordada (las funciones son asíncronas y
los binarios viajan como base64url en JSON):

**Cliente (`client/src/security/index.js`)**

| Función | Uso |
|---|---|
| `newKdfSalt()` | Sal aleatoria del usuario para la activación. |
| `deriveKeys(password, kdfParams)` → `{ authKey, encKey }` | `authKey` (base64url) se envía al servidor; `encKey` es una `CryptoKey` no exportable. |
| `generateUserKeys()` → `{ publicKeys, privateKeys }` | Pares de cifrado y de firma. |
| `sealPrivateKeys(privateKeys, encKey, userId)` → `sealed` | Bloque cifrado para el servidor. |
| `openPrivateKeys(sealed, encKey, userId)` → `privateKeys` | Lanza `IntegrityError` si se ha manipulado. |
| `verifyServerChallenge(challenge)` | Lanza `ServerIdentityError` si la firma del servidor no es válida. |
| `signChallenge(challenge, privateKeys)` → `signature` | Respuesta al reto. |
| `verifyCertificate(certificate)` → `publicKeys` | Lanza `ServerIdentityError` si el certificado no es válido. |
| `encryptCard(card, { cardId, ownerId, version, publicKeys })` → `envelope` | |
| `decryptCard(envelope, { cardId, ownerId, privateKeys })` → `card` | Lanza `IntegrityError` si se ha manipulado. |

**Servidor (`server/security/index.js`)**

| Función | Uso |
|---|---|
| `loadServerKeys(passphrase)` | Se llama al arrancar; falla si la frase de paso no es correcta. |
| `hashAuthKey(authKey)` → `stored` / `verifyAuthKey(authKey, stored)` → `boolean` | Comparación en tiempo constante. |
| `fakeKdfParams(email)` → `kdfParams` | Sal determinista para emails que no existen. |
| `newToken()` → `{ token, tokenHash }` / `hashToken(token)` | Invitaciones y sesiones. |
| `newTotpSecret(email)` → `{ secret, otpauthUri }` / `verifyTotp(secret, code, lastCounter)` → `{ ok, counter }` | |
| `sealServerData(plaintext, context)` / `openServerData(sealed, context)` | Datos que genera el servidor, como el secreto TOTP. |
| `newChallenge(loginContext)` → `challenge` | Reto firmado por el servidor. |
| `verifyChallengeResponse(challenge, signature, publicKeys)` → `boolean` | |
| `issueCertificate({ userId, email, publicKeys })` → `certificate` | |

**Implementaciones provisionales.** Mientras el equipo no entregue su
implementación, cada `index.js` reexporta un `stub.js` escrito por Claude. Ese
stub mantiene los formatos y el flujo, pero **no protege nada** (por ejemplo,
«cifra» con base64). Mientras esté activo:

- el servidor escribe un aviso al arrancar y **se niega a arrancar** con
  `NODE_ENV=production`;
- la interfaz muestra la franja «Capa de seguridad provisional: no uses datos
  reales».

Cambiar a la implementación real consiste solo en cambiar la reexportación.

**Pruebas de contrato.** Claude escribe pruebas (`node:test`) que fijan el
comportamiento de la interfaz: ida y vuelta, unicidad de IV y claves,
detección de manipulación y rechazo de claves o firmas ajenas. Las pruebas de
funcionamiento deben pasar con el stub y con la implementación real; las de
seguridad están marcadas y solo pasan con la real. Las del cliente se ejecutan
en Node porque `globalThis.crypto.subtle` es la misma API que en el navegador.

*Alternativa descartada:* que Claude escribiera la criptografía y el equipo la
revisara. No cumple el objetivo de la práctica.

### D2. Algoritmos propuestos (los decide el equipo)

Si el equipo los cambia, la interfaz de D1 no cambia.

| Uso | Propuesta | Motivo / alternativa |
|---|---|---|
| Derivación desde la contraseña | PBKDF2-HMAC-SHA-256, 600 000 iteraciones, sal de 16 B por usuario → `K_m` (256 bits) | Es nativo en Web Crypto. Argon2id es mejor, pero exigiría una librería WASM: mejora futura. |
| Separación de claves | HKDF-SHA-256 sobre `K_m` con `info` = `"pi/auth/v1"` → `K_auth`, y `"pi/enc/v1"` → `K_enc` | Así el servidor recibe una clave de la que no puede obtener `K_enc`. |
| Almacenamiento de `K_auth` | scrypt (`node:crypto`) con sal de 16 B | `K_auth` ya tiene mucha entropía; scrypt añade defensa en profundidad. |
| Par de cifrado del usuario | RSA-OAEP 3072, SHA-256 | Envolver claves AES es directo y fácil de expresar en la notación. Alternativa: X25519 + HKDF + AES-KW. |
| Par de firma del usuario y del servidor | ECDSA P-256, SHA-256 | Nativo en ambos lados. Alternativa: Ed25519 (compatibilidad desigual entre navegadores). |
| Custodia de las claves privadas | AES-256-GCM con `K_enc`, IV de 96 bits aleatorio, AAD = `userId‖"privkeys/v1"` | |
| Datos de una tarjeta | AES-256-GCM, `K_t` aleatoria de 256 bits y IV de 96 bits por versión, AAD = `cardId‖ownerId‖version` | `cardId` es un UUID generado en el cliente antes de cifrar, para poder incluirlo en la AAD. |
| Envoltura de `K_t` | RSA-OAEP(`PK_enc` del propietario, `K_t`) | El sobre guarda una lista de claves envueltas para poder compartir en la fase 2. |
| Datos del servidor en reposo | AES-256-GCM con `K_srv` (aleatoria y guardada en el almacén de claves del servidor) | |
| Sal falsa | HMAC-SHA-256(`K_fake`, email) | Contra la enumeración de usuarios. |
| TOTP | RFC 6238, HMAC-SHA-1, 6 dígitos, 30 s, ±1 periodo; secreto de 160 bits | Compatible con las apps habituales. |

### D3. Protocolos (borrador para la notación de la memoria)

Notación: `‖` concatenación, `Sig_X(m)` firma con la clave privada de X,
`E_K(m; aad)` cifrado AES-GCM, `W_PK(k)` envoltura RSA-OAEP, `$` valor aleatorio.

**Activación** (token de invitación `tok`):

1. C → S: `GET /api/invitations/tok` → S devuelve `{ email, name, role }`.
2. C → S: `POST /api/invitations/tok/totp` → S genera `s_totp`, lo guarda
   sellado y devuelve `otpauthUri` (C muestra el QR).
3. C: `salt ← $`, `K_m ← PBKDF2(pw, salt, c)`, `K_auth, K_enc ← HKDF(K_m, …)`,
   genera `(PK_enc, SK_enc)` y `(PK_sig, SK_sig)`, y calcula
   `sealed ← E_K_enc(SK_enc‖SK_sig; userId‖"privkeys/v1")`.
4. C → S: `POST /api/invitations/tok/activate { salt, c, K_auth, PK_enc, PK_sig, sealed, totp }`.
5. S comprueba el TOTP, guarda `scrypt(K_auth, salt_s)`, emite
   `cert ← Sig_S(userId‖email‖PK_enc‖PK_sig‖t)`, consume `tok` y activa la cuenta.

**Inicio de sesión:**

1. `POST /api/auth/prelogin { email }` → `{ salt, c }` (la sal es falsa si el email no existe).
2. `POST /api/auth/login { email, K_auth }` → `{ loginId }`. El servidor guarda
   el estado del intento, que caduca a los 2 minutos.
3. `POST /api/auth/totp { loginId, code }` →
   `{ challenge = (loginId, n←$, Sig_S("pi/challenge/v1"‖loginId‖n‖email)), sealed, cert }`.
4. C verifica `Sig_S` con la `PK_S` incorporada, abre `sealed` con `K_enc` y
   responde `POST /api/auth/response { loginId, Sig_U("pi/response/v1"‖loginId‖n) }`.
5. S verifica la firma con `PK_sig` y crea la sesión (cookie).

**Desbloqueo tras recargar la página** (con la sesión vigente):
`POST /api/auth/unlock { K_auth }` → `{ sealed, cert }`. No se repite el TOTP.

**Guardar una tarjeta:** `K_t ← $`, `iv ← $`,
`env = { iv, ct = E_K_t(json; cardId‖ownerId‖v), keys: [{ userId, W_PK_enc(K_t) }], v }`.

### D4. API (la implementa Claude)

| Endpoint | Rol |
|---|---|
| `POST /api/auth/prelogin`, `/login`, `/totp`, `/response` | público |
| `POST /api/auth/unlock`, `/logout`; `GET /api/auth/session` | sesión |
| `GET /api/invitations/:token`; `POST /api/invitations/:token/totp`, `/activate` | público con token |
| `POST /api/invitations`; `GET /api/users`; `PATCH /api/users/:id` | gestor |
| `GET /api/cards`, `POST /api/cards`, `GET\|PUT\|DELETE /api/cards/:id` | sesión (solo las tarjetas propias) |

Todos los cuerpos se validan en el servidor, con límites de tamaño. Los
errores de autenticación siempre devuelven `401 { "error": "Credenciales inválidas" }`.
`PUT` exige la `version` anterior para evitar que se pisen ediciones concurrentes.

### D5. Modelo de datos (migraciones de Knex)

- `users`: `id` (UUID), `email` (único, en minúsculas), `name`, `role`
  (`manager`/`employee`), `status` (`pending`/`active`/`disabled`),
  `kdf_salt`, `kdf_iterations`, `auth_hash`, `pub_enc`, `pub_sig`,
  `certificate`, `sealed_private_keys`, `totp_sealed`, `totp_last_counter`,
  `created_at` y `updated_at`. Sustituye a `USER`.
- `invitations`: `token_hash`, `user_id`, `expires_at`, `used_at`.
- `login_attempts`: `id`, `user_id` (nulo si el email no existe), `step`,
  `challenge`, `expires_at`.
- `sessions`: `token_hash`, `user_id`, `last_seen_at`, `expires_at`.
- `rate_limits`: clave (email o IP), contador y ventana.
- `cards`: `id` (UUID del cliente), `owner_id`, `version`, `envelope` (JSON
  cifrado), `created_at` y `updated_at`.
- Se elimina la tabla `notes` y su código.

### D6. HTTPS, sesión y cabeceras (los implementa Claude, revisión del equipo)

- `npm run setup` (script de Node, compatible con Windows): genera el par de
  claves del servidor y el almacén de claves cifrado en `server/keys/`
  (ignorado por git), el certificado TLS autofirmado de desarrollo (paquete
  `selfsigned`) y `client/src/security/server-public-key.js`.
- En desarrollo Vite sirve por HTTPS con ese certificado, y Express escucha
  por HTTPS en `localhost:3000`, detrás del proxy de Vite. En producción
  Express sirve también el cliente compilado.
- Configuración con `node --env-file=.env` (Node ≥ 20.6), que funciona igual en
  Windows: `SERVER_KEY_PASSPHRASE`, `NODE_ENV` y `PORT`.
- Cabeceras con `helmet`, con una CSP sin `unsafe-inline` en los scripts.
  Limitación de intentos en SQLite (sin servicios externos). QR con la
  librería `qrcode`, generado en el cliente.

### D7. Interfaz (la implementa Claude)

Vistas: activación (contraseña, QR del TOTP y confirmación), login en tres
pasos (credenciales → código TOTP → verificación automática), desbloqueo, lista
y formulario de tarjetas, y gestión de usuarios para el gestor. Las claves
viven en un contexto de React en memoria y se borran al cerrar sesión. Se
mantiene el estilo actual de `style.css`.

## Risks / Trade-offs

- [Un XSS podría leer las claves que hay en memoria] → CSP estricta, ningún
  `dangerouslySetInnerHTML` y claves no exportables cuando sea posible.
- [Un servidor comprometido puede servir JavaScript que filtre la contraseña]
  → Limitación aceptada; se documenta en la memoria como trabajo futuro (por
  ejemplo, Subresource Integrity o un cliente instalable).
- [Si se olvida la contraseña, las tarjetas se pierden] → Aviso explícito en la
  activación; la recuperación queda para la fase 2.
- [El stub llega a la entrega] → El servidor no arranca con el stub en
  producción; las pruebas de seguridad fallan con el stub; la franja de aviso
  queda visible en la demo.
- [600 000 iteraciones de PBKDF2 tardan en equipos lentos] → Se mide en la
  demo; el número de iteraciones se guarda por usuario para poder ajustarlo.
- [Reloj desajustado en el TOTP] → Tolerancia de ±1 periodo.
- [better-sqlite3 es un módulo nativo] → Tiene binarios precompilados para
  Windows x64 con Node 20/22/24; se comprueba en un equipo con Windows.
- [El equipo y Claude dependen de la misma interfaz] → La interfaz se acuerda
  primero (tarea 1) y cualquier cambio posterior se hace en `design.md` antes
  de tocar el código.

## Migration Plan

Solo hay datos locales de desarrollo. La nueva migración elimina `USER` y
`notes` y crea el esquema de D5; `db:rollback` la deshace. Tras actualizar el
código: `npm install`, `npm run setup`, `npm run db:migrate --workspace=server`
y `npm run create-admin --workspace=server -- <email>`.

## Open Questions

- Iteraciones exactas de PBKDF2 y parámetros de scrypt: se ajustan midiendo en
  los equipos del grupo. No cambian la interfaz ni las tareas.
- Si la implementación real del cliente se escribe directamente sobre Web
  Crypto o con una pequeña capa de utilidades propia: lo decide el equipo.
