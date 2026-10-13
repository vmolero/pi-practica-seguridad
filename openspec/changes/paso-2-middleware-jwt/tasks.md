# Tareas

Requisito previo: `paso-1-login-texto-claro` terminado y archivado. Las tareas
[equipo] son la firma y verificación criptográfica del token; el resto es
[claude]. El grupo 3 puede empezar en cuanto exista el contrato del grupo 2
(tarea 2.3), en paralelo con los grupos 4 a 6.

## 1. Configuración y dependencias

- [ ] 1.1 [claude] Añadir `jose` al workspace del servidor (`npm install jose --workspace=server`) y verificar que `npm test --workspace=server` sigue pasando
- [ ] 1.2 [claude] Crear `server/src/config.js` con `loadConfig(env)`: `port`, `jwtSecret` (`JWT_SECRET`, mínimo 32 caracteres; si falta, 32 bytes aleatorios y aviso en consola) y `jwtTtlSeconds` (`JWT_TTL_SECONDS`, por defecto 3600); test unitario de los tres casos (definido, ausente, demasiado corto → error)

## 2. Dominio, errores y contrato del servicio de tokens

- [ ] 2.1 [claude] Añadir `InvalidTokenError` a `server/src/application/errors.js`
- [ ] 2.2 [claude] Crear `server/src/domain/session.js` con `toSessionClaims(user)` y `sessionUserFromClaims(claims)` (devuelve `null` ante `sub` no numérico, `email`/`name` no cadena o `isAdmin` no booleano), con tests unitarios
- [ ] 2.3 [claude] Crear `server/src/infrastructure/security/README.md` con el contrato de `createTokenService({ secret, ttlSeconds, issuer, now })` → `{ sign(claims), verify(token) }`, los *claims* y el reparto equipo/claude, y `server/test/token-service.contract.js` con `runTokenServiceContractTests(createService)` que cubra: ida y vuelta de los *claims* con `iss`, `iat` y `exp = iat + ttl`; token manipulado; firmado con otra clave; caducado (usando `now`); cabecera con `alg: none`; cadena ilegible → todos lanzan `InvalidTokenError`

## 3. Servicio de tokens

- [ ] 3.1 [claude] Crear `server/src/infrastructure/security/token-service.js` PROVISIONAL con `jose` (HS256, algoritmo fijo en `verify`, `issuer` comprobado, `clockTolerance: 0`), marcado como provisional en un comentario de cabecera, y `server/test/token-service.test.js` que ejecute la batería de contrato contra él; verificar que pasa
- [ ] 3.2 [equipo] Decidir el algoritmo de firma asimétrica (EdDSA/Ed25519 o ES256), generar el par de claves del servidor con OpenSSL, decidir dónde se guardan (`server/keys/`, excluido de git) y cómo se cargan en `loadConfig`; dejarlo escrito en `server/src/infrastructure/security/README.md`
- [ ] 3.3 [equipo] Sustituir la implementación provisional por la firma asimétrica con la misma interfaz `createTokenService`, sin tocar nada fuera de `server/src/infrastructure/security/` salvo `config.js`/`index.js` para cargar las claves; añadir el *runner* del contrato para la nueva implementación y verificar que `npm test --workspace=server` pasa sin modificar `token-service.contract.js`
- [ ] 3.4 [equipo] Describir en `docs/primera-memoria/implementacion-y-seguridad.md` la firma elegida con notación inequívoca (`Sign(SK_servidor, h || "." || p)` y `Verify(PK_servidor, …)`), la generación de claves y por qué se rechaza `alg: none`

## 4. Login que emite el token

- [ ] 4.1 [claude] Cambiar `createAuthService({ userRepository, tokenService })` para que `login()` devuelva `{ token, user }`; actualizar `server/test/auth-service.test.js` con un `tokenService` falso (comprueba que `sign` recibe `toSessionClaims(user)` y que `user` no incluye la contraseña)
- [ ] 4.2 [claude] Actualizar `public-router.js` y `server/test/public-login.test.js` al cuerpo `{ "token", "user": { "email", "name", "isAdmin" } }` según el delta de `specs/autenticacion/spec.md`; verificar que los escenarios de `401` y `400` no cambian

## 5. Middleware y sección privada

- [ ] 5.1 [claude] Crear `server/src/infrastructure/http/auth-middleware.js` (`createAuthMiddleware({ tokenService })`): parseo de `Authorization: Bearer` sin distinguir mayúsculas en el esquema, `verify`, `sessionUserFromClaims`, `request.user`, `401 { "error": "No autenticado" }` con `WWW-Authenticate: Bearer` y `next(error)` para errores no previstos
- [ ] 5.2 [claude] Crear `server/test/auth-middleware.test.js` con `request`/`response`/`next` simulados y un `tokenService` falso: sin cabecera, `Basic`, `Bearer` sin token, `bearer` en minúsculas, `InvalidTokenError`, error inesperado → `next(error)`, *claims* incompletos, caso correcto
- [ ] 5.3 [claude] Crear `private-router.js` (`createPrivateRouter({ authMiddleware })` con el middleware antes de toda ruta y `GET /me`), ampliar `createApp({ authService, tokenService, notesStore })` para montar `/api/private`, y conectar `loadConfig` y `createTokenService` en `server/index.js`
- [ ] 5.4 [claude] Crear `server/test/private-me.test.js` que cubra todos los escenarios del lado del servidor de `specs/sesion-jwt/spec.md`: `/me` de empleado y administrador, sin cabecera, esquema distinto, token ilegible, manipulado, firmado con otro secreto, caducado, `alg: none`, *claims* incompletos, ruta privada inexistente con y sin token, cuerpo y cabecera del `401`, y `/api/health` y login sin token; verificar que `npm test --workspace=server` pasa

## 6. Cliente

- [ ] 6.1 [claude] Crear `client/src/api/session.js` (token en memoria) y `client/src/api/http.js` (`apiFetch` con `Authorization: Bearer`, `401` → borra el token y lanza `SessionExpiredError` con `Tu sesión ha caducado. Vuelve a iniciar sesión.`)
- [ ] 6.2 [claude] Actualizar `client/src/api/auth.js`: `login()` guarda el token y devuelve `user`; `logout()` borra el token; nueva `getCurrentUser()` que llama a `GET /api/private/me` mediante `apiFetch`
- [ ] 6.3 [claude] Actualizar `SessionView.jsx` (llama a `getCurrentUser()` al montarse, muestra `name` y `email`, avisa con `onSessionExpired` ante `SessionExpiredError`), `App.jsx` (estado del aviso) y `LoginForm.jsx` (prop `notice` en el área de alerta); verificar en el navegador los cuatro escenarios de "Uso del token en el cliente" (vista con nombre, caducidad con `JWT_TTL_SECONDS=5`, recarga, cierre de sesión) y confirmar en las herramientas del navegador que no hay nada en `localStorage`, `sessionStorage` ni cookies

## 7. Documentación y verificación final

- [ ] 7.1 [claude] Actualizar el README: nuevo cuerpo del login, sección `/api/private` con `GET /me`, variables `JWT_SECRET` y `JWT_TTL_SECONDS`, aviso del secreto aleatorio por proceso, y ejemplo con `curl` (login, `/me` con cabecera, `/me` sin cabecera → `401`); verificar que los comandos documentados funcionan en el entorno actual
- [ ] 7.2 [claude] Actualizar `docs/primera-memoria/implementacion-y-seguridad.md` (formato del token con la notación de `design.md` D5, flujo del middleware, decisión cabecera frente a cookie, límites: sin revocación, secreto provisional) y `manual-de-usuario.md` (vista de sesión con nombre, aviso de sesión caducada, qué pasa al recargar)
- [ ] 7.3 [claude] Verificación de extremo a extremo: `npm install`, `npm test --workspace=server`, `npm run dev`, login como empleado y como administrador, `/me` desde la vista de sesión, caducidad y cierre de sesión; ejecutar `openspec validate paso-2-middleware-jwt --strict`

## Workflow follow-up

- Archivar con `/opsx:archive` cuando los grupos 1 a 7 estén hechos, incluidas las tareas [equipo] (si el equipo entrega más tarde, archivar con la provisional y abrir un cambio pequeño para la sustitución).
- Siguiente paso sugerido: hash de contraseñas con sal (capa de seguridad del equipo) sobre la comparación provisional de `auth-service.js`.
- Al retomar `fase-1-registro-y-cifrado`, reescribir su requisito "Sesión" partiendo de `sesion-jwt`.
