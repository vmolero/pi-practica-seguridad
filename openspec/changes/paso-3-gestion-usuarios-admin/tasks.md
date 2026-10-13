# Tareas

Requisito previo: el código del paso 2 (`paso-2-middleware-jwt`) ya está en
`main`; sus tareas pendientes son del equipo y no bloquean este cambio. Este
paso no toca primitivas criptográficas, así que todas las tareas son [claude].

## 1. Dominio, errores y repositorio

- [x] 1.1 [claude] Añadir `toAdminUser(user)` a `server/src/domain/user.js` (devuelve `{ id, name, email, isAdmin }`, nunca `password`) con su test unitario
- [x] 1.2 [claude] Añadir `UserNotFoundError`, `DuplicateEmailError` y `SelfDeletionError` a `server/src/application/errors.js` con los mensajes de `design.md` D3
- [x] 1.3 [claude] Ampliar `user-repository.js` con `list()` (ordenado por `id`), `findById(id)`, `create({ name, email, password, isAdmin })` (devuelve el usuario creado), `rename(id, name)` y `remove(id)` (ambos devuelven si había fila); verificar con un test sobre la base temporal de `helpers.js`

## 2. Servicio de administración de usuarios

- [x] 2.1 [claude] Crear `server/src/application/user-admin-service.js` con `createUserAdminService({ userRepository })`: `list`, `create` (comprueba email repetido antes de insertar y traduce `SQLITE_CONSTRAINT` del índice `user_email_unique` a `DuplicateEmailError`), `rename` y `remove(id, { actingUserId })` (lanza `SelfDeletionError` antes de borrar); todo lo devuelto pasa por `toAdminUser`. La contraseña inicial se guarda tal cual, con un comentario PROVISIONAL como en `auth-service.js`
- [x] 2.2 [claude] Crear `server/test/user-admin-service.test.js` con un repositorio falso en memoria: alta correcta, email repetido, renombrar y borrar inexistente → `UserNotFoundError`, autoeliminación → `SelfDeletionError` sin llamar a `remove`, ninguna salida incluye `password`

## 3. Capa HTTP

- [x] 3.1 [claude] Crear `server/src/infrastructure/http/user-request.js` con `parseCreateUserRequest`, `parseRenameUserRequest` (rechaza cualquier campo distinto de `name`) y `parseUserId`, según las reglas de la spec y `design.md` D4, y `server/test/user-request.test.js` que cubra cada límite (nombre vacío y de 101 caracteres, email sin `@` o con dos, contraseña de 7 y de 129, `isAdmin` no booleano, campos extra, cuerpos que no son objeto, ids `0`, `-1`, `abc`, `1.5`)
- [x] 3.2 [claude] Crear `server/src/infrastructure/http/require-admin.js` con `createRequireAdmin({ userRepository })` (D2): `403 { "error": "Acceso denegado" }` si el token no es de administrador o si el usuario ya no existe o no es administrador en la base de datos
- [x] 3.3 [claude] Crear `server/src/infrastructure/http/admin-router.js` con `createAdminRouter({ userAdminService, requireAdmin })`: `express.json()`, `requireAdmin` antes de toda ruta, `GET/POST /users`, `PATCH/DELETE /users/:id`, traducción de errores de aplicación a `400/404/409` y JSON ilegible → `400 { "error": "Datos de usuario no válidos" }`
- [x] 3.4 [claude] Montar el router en `/api/private/admin` desde `createPrivateRouter`, ampliar `createApp` para recibir `userAdminService` y `userRepository`, y conectarlo todo en `server/index.js` y `server/test/test-app.js`; verificar que los tests existentes siguen pasando sin cambios en sus aserciones

## 4. Pruebas de integración

- [x] 4.1 [claude] Crear `server/test/admin-users.test.js` con `startTestServer()` (una instancia nueva para cada test que modifica datos) que cubra todos los escenarios del lado del servidor de `specs/administracion-usuarios/spec.md`: `401` sin token, `403` de empleado en `GET` y `POST` (comprobando que no se crea nada), administrador eliminado con token válido → `403`, listado sin `password`, alta con email normalizado y login posterior, alta de otro administrador que accede al panel, email repetido con otras mayúsculas → `409`, validaciones → `400`, `PATCH` con campos extra → `400`, renombrar, `404` por id inexistente y no numérico, borrado → `204` y login posterior → `401`, autoeliminación → `400`
- [x] 4.2 [claude] Ejecutar `npm test --workspace=server` y verificar que pasa entero

## 5. Cliente

- [x] 5.1 [claude] Crear `client/src/api/admin-users.js` (`listUsers`, `createUser`, `renameUser`, `deleteUser` sobre `apiFetch`, `ForbiddenError` ante `403`, mensaje del servidor ante `400/404/409`, mensaje genérico de conexión en otro caso), según `design.md` D6
- [x] 5.2 [claude] Crear `client/src/components/UserAdminPanel.jsx`: tabla con `<caption>` (nombre, email, rol), formulario de alta con etiquetas y casilla de administrador, edición del nombre en línea (Guardar / Cancelar), eliminación en dos pasos en la propia fila sin `window.confirm`, sin botón de eliminar en la fila propia, área `role="alert"` para errores, que vacía el formulario tras un alta correcta y conserva los campos salvo la contraseña tras un error
- [x] 5.3 [claude] Montar el panel en `SessionView.jsx` solo si `currentUser.isAdmin`, propagar `SessionExpiredError` a `onSessionExpired` y, ante `ForbiddenError`, mostrar `No tienes permiso para gestionar usuarios.` y ocultar las acciones; añadir los estilos necesarios a `style.css` reutilizando las variables existentes y comprobando que se ve bien a 360 px de ancho
- [x] 5.4 [claude] Verificar en el navegador todos los escenarios de "Panel de administración en el cliente": el empleado no ve el panel ni hace peticiones a `/api/private/admin` (pestaña de red), alta, email repetido, renombrar, eliminar y cancelar, caducidad con `JWT_TTL_SECONDS=5` y `403` tras eliminar al administrador desde otra sesión

## 6. Documentación y verificación final

- [x] 6.1 [claude] Actualizar `README.md`: "Estado actual" (paso 3), "API" (los cuatro endpoints con sus cuerpos y códigos, el `403` y un ejemplo con `curl` de alta y listado como administrador) y "Vista de login" (el panel que ve el administrador tras iniciar sesión); verificar que los comandos documentados funcionan
- [x] 6.2 [claude] Añadir a `docs/primera-memoria/implementacion-y-seguridad.md` la sección "Panel de administración de usuarios (paso 3)": control de acceso por rol con la notación de `design.md` D2, por qué se consulta la base de datos además del token, flujo de cada endpoint, validación, y límites (contraseña inicial en texto claro, `/me` de un usuario eliminado, nombre del token desactualizado); actualizar "Estructura del proyecto" y "Trabajo futuro"
- [x] 6.3 [claude] Reescribir la sección "Rol de gestor" de `docs/primera-memoria/manual-de-usuario.md` para describir el panel real (ver usuarios, dar de alta, renombrar, eliminar, mensajes de error y qué ocurre si se pierde el permiso), dejando como pendientes las funciones de tarjetas y contratos
- [x] 6.4 [claude] Verificación de extremo a extremo: `npm install`, `npm test --workspace=server`, `npm run dev`, recorrido completo como administrador y como empleado; ejecutar `openspec validate paso-3-gestion-usuarios-admin --strict` (no se ejecutó `db:seed` porque la base de desarrollo tenía usuarios creados a mano que el seed borraría; los usuarios de prueba creados en la verificación se eliminaron al terminar)
