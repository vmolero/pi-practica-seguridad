# Propuesta: paso 2 — middleware de autenticación con JWT

## Why

Tras el paso 1 el servidor sabe comprobar unas credenciales, pero no tiene
forma de reconocer al usuario en las peticiones siguientes: toda la API es
pública y la "sesión" existe solo en la memoria del navegador. Antes de
proteger datos reales (tarjetas, usuarios) hace falta un mecanismo de sesión
que autentique cada petición y un sitio único, el middleware, donde esa
comprobación viva. Las notas de clase (`docs/servidor-tener-encuenta.md`)
piden expresamente una "validación mediante middleware estructurado de
autenticación".

## What Changes

- **El login emite un token**: `POST /api/public/login` sigue validando las
  credenciales como hasta ahora, pero su respuesta `200` pasa a ser
  `{ "token", "user": { "email", "name", "isAdmin" } }`. El token es un JWT
  firmado por el servidor con caducidad.
- **Sección privada de la API**: nuevo prefijo `/api/private` para todo lo que
  requiere sesión. Su primer endpoint es `GET /api/private/me`, que devuelve el
  usuario autenticado y sirve para verificar la cadena completa.
- **Middleware de autenticación**: toda petición a `/api/private/*` pasa por un
  middleware que lee el token de la cabecera `Authorization: Bearer <token>`,
  verifica la firma y la caducidad y deja en `request.user` al usuario
  (`id`, `email`, `name`) y su rol (`isAdmin`). Si falta el token o no es
  válido responde `401 { "error": "No autenticado" }` sin ejecutar la ruta.
- **Interfaz de firma de tokens**: la emisión y verificación del JWT quedan
  detrás de una interfaz (`sign`/`verify`) que pertenece a la capa de
  seguridad del equipo. Claude entrega una implementación provisional
  (HMAC con un secreto del entorno, mediante la librería `jose`) claramente
  marcada; el equipo la sustituye por una firma asimétrica con el par de
  claves del servidor.
- **Cliente**: `client/src/api/auth.js` guarda el token solo en memoria, lo
  añade a las peticiones privadas y lo descarta al cerrar sesión. La vista de
  sesión llama a `GET /api/private/me`; si el servidor responde `401` (token
  caducado o inválido) la interfaz vuelve al login con un aviso.
- **BREAKING**: cambia el cuerpo del `200` de `POST /api/public/login`. El
  único consumidor es el cliente de este repositorio, que se actualiza en el
  mismo cambio.

Fuera de alcance: revocación de tokens en el servidor, renovación o *refresh*,
cierre de sesión en el servidor, persistencia de la sesión al recargar la
página, guardas por rol (403), cookies, HTTPS, límite de intentos y cualquier
cambio en el hash de contraseñas o en el recurso `notes`.

## Capabilities

### New Capabilities

- `sesion-jwt`: cómo el servidor emite un token de sesión, cómo viaja en cada
  petición, cómo se verifica en la sección privada de la API y qué recibe el
  cliente cuando el token falta, es inválido o ha caducado.

### Modified Capabilities

- `autenticacion`: el requisito "Endpoint público de login" cambia la
  respuesta `200` para incluir el token junto al usuario, y el requisito
  "Login desde la pantalla del cliente" pasa a guardar el token y a usarlo en
  la vista de sesión. Esta capacidad la introduce el cambio
  `paso-1-login-texto-claro`, todavía en curso y sin sincronizar a
  `openspec/specs/`; este cambio debe aplicarse y archivarse después de aquel.

## Impact

- **Servidor**: nueva carpeta `server/src/infrastructure/security/` con la
  interfaz del servicio de tokens y su implementación provisional; nuevo
  middleware y router privado en `server/src/infrastructure/http/`;
  `auth-service.js` devuelve el token; `app.js` e `index.js` conectan las
  piezas; nueva dependencia `jose` en `server/package.json`; nueva variable de
  entorno opcional `JWT_SECRET`.
- **Cliente**: `client/src/api/auth.js`, `App.jsx` y `SessionView.jsx`.
- **Tests**: nuevos tests del servicio de tokens, del middleware y del endpoint
  privado; el test de login del paso 1 se actualiza al nuevo cuerpo.
- **Base de datos**: sin cambios.
- **Reparto**: la firma y verificación del token (algoritmo, claves y su
  custodia) es capa de seguridad del equipo. El middleware, los *claims*, la
  política de caducidad, el router privado, el cliente y los tests son de
  Claude.
- **Relación con `fase-1-registro-y-cifrado`**: aquella propuesta prevé una
  sesión con cookie `HttpOnly` e identificador aleatorio guardado en el
  servidor. Este paso elige un JWT en cabecera `Authorization`; cuando se
  retome la fase 1 habrá que reescribir su requisito "Sesión" partiendo de
  `sesion-jwt` o justificar el cambio a cookie.
- **Memoria**: hay que describir el formato del token, lo que firma el
  servidor y el flujo de verificación con notación inequívoca, y dejar claro
  que el secreto HMAC provisional no es el diseño final.
