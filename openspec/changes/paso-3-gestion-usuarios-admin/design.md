# Diseño: paso 3 — panel de administración de usuarios

## Context

- Tras el paso 2, el servidor tiene arquitectura por capas en `server/src/`
  (dominio, aplicación, infraestructura HTTP, base de datos y seguridad),
  `createApp({ authService, tokenService })` con inyección por fábricas y
  tests con `node:test` que levantan la app real sobre SQLite.
- Toda ruta bajo `/api/private` pasa por `createAuthMiddleware`, que deja en
  `request.user` `{ id, email, name, isAdmin }` sacados del token. No consulta
  la base de datos y no hay revocación: un token vale hasta que caduca
  (`JWT_TTL_SECONDS`, 1 h por defecto).
- La tabla `USER` tiene `id`, `name`, `email` (único, en minúsculas),
  `password` (texto claro, provisional) e `isAdmin`. No hace falta migración.
- El cliente guarda el token en memoria (`api/session.js`) y usa `apiFetch`,
  que ante un `401` borra el token y lanza `SessionExpiredError`.
  `SessionView.jsx` ya recibe `user.isAdmin`.
- `fase-1-registro-y-cifrado` prevé una capacidad `gestion-usuarios` con
  invitaciones, activación en el navegador y desactivación. Este paso es una
  versión intermedia, sin criptografía, que esa fase sustituirá.
- Reparto: este cambio no toca primitivas criptográficas, así que todas las
  tareas son [claude]. El equipo solo revisa la sección de la memoria sobre el
  control de acceso.

## Goals / Non-Goals

**Goals:**

- Primer control de acceso por rol, aplicado en el servidor e independiente de
  lo que muestre la interfaz.
- CRUD mínimo de usuarios (listar, alta, renombrar, eliminar) probado de
  extremo a extremo.
- Mantener la separación por capas: las reglas (email repetido,
  autoeliminación) viven en un servicio de aplicación testeable sin HTTP.

**Non-Goals:**

- Cambiar email, rol o contraseña de un usuario existente.
- Desactivar cuentas en lugar de borrarlas, invitación por enlace, auditoría.
- Revocar los tokens de un usuario eliminado fuera del panel de
  administración (`/api/private/me` sigue respondiendo con los datos del token
  hasta que caduque).
- Hash de la contraseña inicial: lo hará el equipo en la capa de seguridad.

## Decisions

### D1. Rutas bajo `/api/private/admin/users`

Se monta un `createAdminRouter` dentro del router privado, de modo que hereda
el middleware de autenticación (un `401` sigue siendo uniforme y una ruta
inexistente sin token sigue dando `401`, no `404`). Los recursos siguen REST:
`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`.

*Alternativa descartada:* `/api/admin/...` fuera de `/api/private`. Obligaría a
montar el middleware dos veces y rompería la regla de que "todo lo privado
cuelga de `/api/private`".

### D2. Doble comprobación del rol: token + base de datos

`createRequireAdmin({ userRepository })` se ejecuta después del middleware de
autenticación:

1. Si `request.user.isAdmin !== true` → `403` sin consultar la base de datos.
2. Si no, `userRepository.findById(request.user.id)`; si no existe o
   `isAdmin` es falso → `403`.
3. Si todo va bien → `next()`.

Con notación: sea `t` el token y `c = Verify(t)` sus *claims*. Se permite la
operación sii `c.isAdmin = true ∧ ∃u ∈ USER : u.id = c.sub ∧ u.isAdmin = true`.

*Por qué:* el token no se puede revocar, y el borrado de usuarios crea
justamente el caso de un token válido de alguien que ya no existe. Para las
operaciones de administración, que son las más sensibles, una consulta por
petición es un coste despreciable en SQLite.

*Alternativa descartada:* fiarse solo del *claim* `isAdmin`. Más simple, pero
un administrador eliminado podría seguir borrando usuarios durante una hora.

`403` responde `{ "error": "Acceso denegado" }` sin distinguir la causa.

### D3. Servicio de aplicación `createUserAdminService({ userRepository })`

Métodos `list()`, `create({ name, email, password, isAdmin })`,
`rename(id, name)` y `remove(id, { actingUserId })`. Lanza errores de
aplicación nuevos en `errors.js`:

- `UserNotFoundError` → `404 { "error": "Usuario no encontrado" }`
- `DuplicateEmailError` → `409 { "error": "Ya existe un usuario con ese email" }`
- `SelfDeletionError` → `400 { "error": "No puedes eliminar tu propia cuenta" }`

El router traduce cada error a su respuesta; cualquier otro error sigue al
manejador general (`500`). Todo lo que devuelve el servicio pasa por una nueva
función de dominio `toAdminUser(user)` → `{ id, name, email, isAdmin }`, que
nunca incluye `password` (mismo patrón que `toPublicUser`).

El email repetido se detecta de dos formas: comprobando `findByEmail` antes de
insertar (mensaje claro) y traduciendo la violación del índice único
`user_email_unique` (`SQLITE_CONSTRAINT`) a `DuplicateEmailError`, para cubrir
dos altas simultáneas.

### D4. Validación en la capa HTTP

`server/src/infrastructure/http/user-request.js` con `parseCreateUserRequest`
y `parseRenameUserRequest`, siguiendo el estilo de `login-request.js`:
devuelven el objeto normalizado o `null`. El rechazo de campos no admitidos en
`PATCH` evita que alguien intente subirse el rol "por la puerta de atrás".
`parseUserId(param)` acepta solo `/^[1-9]\d*$/` y enteros seguros; cualquier
otro valor se trata como `404`, igual que un id inexistente, para no
distinguir formatos.

Los límites (nombre ≤ 100, email ≤ 254, contraseña 8–128) son coherentes con
el login: la contraseña máxima es la misma, y la mínima de 8 evita altas con
contraseñas triviales mientras siga siendo texto claro.

### D5. Estado del nombre en el token

El token lleva `name` en sus *claims*. Si un administrador se renombra a sí
mismo, `/me` seguirá devolviendo el nombre antiguo hasta el siguiente login.
Se acepta: el panel actualiza su tabla con la respuesta del `PATCH`, y la vista
de sesión muestra el nombre del token. Se documenta como límite.

### D6. Cliente

- `client/src/api/admin-users.js`: `listUsers`, `createUser`, `renameUser`,
  `deleteUser` sobre `apiFetch` (hereda el `401` → `SessionExpiredError`).
  Ante `403` lanza `ForbiddenError`; ante `400/404/409` lanza `Error` con el
  `error` del cuerpo; ante otros fallos, un mensaje genérico de conexión.
- `client/src/components/UserAdminPanel.jsx`: se monta en `SessionView`
  solo si `currentUser.isAdmin`. Tabla accesible (`<table>` con `<caption>`),
  formulario de alta con `<label>`s, edición en línea del nombre
  (Guardar / Cancelar) y borrado en dos pasos ("Eliminar" → "Confirmar" /
  "Cancelar") en la misma fila. Nada de `window.confirm`.
- `SessionExpiredError` se propaga a `onSessionExpired`, igual que en la
  vista de sesión.
- Estilos en `style.css` reutilizando las variables y clases existentes.

### D7. Pruebas

- Unitarias del servicio con un repositorio falso en memoria (reglas de
  negocio sin HTTP).
- Unitarias de `user-request.js`.
- Integración `server/test/admin-users.test.js` con `startTestServer()`
  cubriendo cada escenario del lado del servidor de
  `specs/administracion-usuarios/spec.md`. Cada test que modifica datos
  vuelve a sembrar la base, para que el orden no importe.

## Risks / Trade-offs

- [El gestor conoce y fija la contraseña inicial en texto claro] → Marcado
  como PROVISIONAL en código y documentación; la fase 1 lo sustituye por
  invitaciones y hash.
- [Un usuario eliminado sigue pudiendo llamar a `/api/private/me` hasta que
  caduque su token] → Las rutas de administración consultan la base de datos
  (D2); el resto se documenta como límite y se resolverá con la sesión de la
  fase 1 o una comprobación general de existencia.
- [Borrado físico: se pierde el histórico del usuario] → Aún no hay datos
  asociados (tarjetas); cuando existan, la fase 1 introduce la desactivación.
- [Carrera entre dos altas con el mismo email] → Índice único + traducción
  del error de restricción (D3).

## Migration Plan

Sin migraciones de base de datos. Despliegue: actualizar código y reiniciar.
Rollback: revertir el commit; los usuarios creados quedan en la tabla y siguen
siendo válidos para el login del paso 2.

## Open Questions

- ¿Debe el panel permitir también cambiar el rol (`isAdmin`)? Se deja fuera
  porque el enunciado de la petición solo pide el nombre; añadirlo después
  exige además impedir que el último administrador se degrade a sí mismo.
