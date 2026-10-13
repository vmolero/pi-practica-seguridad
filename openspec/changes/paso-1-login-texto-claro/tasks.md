# Tareas

Ninguna tarea toca la capa de seguridad: este paso no tiene criptografía, así
que todas son [claude].

## 1. Base de datos

- [ ] 1.1 [claude] Crear la migración `add_password_to_user` (clave primaria `id`, `password` no nulo e índice único en `email`, con `down` reversible) y verificar que `db:migrate`, `db:rollback` y de nuevo `db:migrate` terminan sin errores
- [ ] 1.2 [claude] Añadir la configuración `seeds` a `server/knexfile.cjs`, el script `db:seed` y el seed `01_usuarios_demo.cjs` con un empleado y un administrador; verificar que `db:seed` deja exactamente esos dos usuarios

## 2. Capas de dominio y aplicación

- [ ] 2.1 [claude] Crear `server/src/domain/user.js` con `toPublicUser(user)`, que devuelve `{ email, name, isAdmin }` sin contraseña
- [ ] 2.2 [claude] Crear `server/src/application/errors.js` y `auth-service.js` (`createAuthService({ userRepository })` con `login({ email, password })`), marcando la comparación en claro como provisional
- [ ] 2.3 [claude] Añadir `npm test` (`node --test`) al workspace del servidor y tests del servicio con un repositorio en memoria: login correcto, contraseña incorrecta, email inexistente y respuesta sin contraseña; verificar que `npm test --workspace=server` pasa

## 3. Capa de infraestructura

- [ ] 3.1 [claude] Crear `server/src/infrastructure/database/knex.js` y `user-repository.js` con `findByEmail(email)`, y verificar con un test sobre una base de datos temporal migrada y sembrada
- [ ] 3.2 [claude] Crear `server/src/infrastructure/http/login-request.js` (`parseLoginRequest`) con tests de los casos de petición no válida de la especificación
- [ ] 3.3 [claude] Crear `public-router.js` con `POST /api/public/login` y `server/src/app.js` (`createApp`) con el manejador de JSON ilegible y de errores; mover la app de `server/index.js` a `createApp` sin cambiar `/api/health` ni `/api/notes`
- [ ] 3.4 [claude] Añadir tests de integración del endpoint que cubran todos los escenarios de `specs/autenticacion/spec.md` del lado del servidor, y verificar que `npm test --workspace=server` pasa

## 4. Cliente

- [ ] 4.1 [claude] Reescribir `login()` en `client/src/api/auth.js` para llamar a `POST /api/public/login`, quitar las credenciales simuladas y distinguir el error de credenciales del de conexión
- [ ] 4.2 [claude] Hacer que `LoginForm.jsx` muestre el mensaje del error recibido, y verificar en el navegador los tres escenarios de interfaz de la especificación (login correcto, credenciales incorrectas y servidor parado)

## 5. Documentación y verificación final

- [ ] 5.1 [claude] Actualizar el README (estado actual, API, migraciones y seed, credenciales de desarrollo, aviso de texto claro) y verificar que los comandos documentados funcionan tal como están escritos
- [ ] 5.2 [claude] Actualizar `docs/primera-memoria/implementacion-y-seguridad.md` y `manual-de-usuario.md` para describir el login real y dejar claro que en este paso la contraseña viaja y se guarda en claro
- [ ] 5.3 [claude] Verificación de extremo a extremo: `db:migrate`, `db:seed`, `npm run dev` y login en el navegador como empleado y como administrador; ejecutar `openspec validate paso-1-login-texto-claro --strict`

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando esté implementado y revisado.
- Replantear `fase-1-registro-y-cifrado` como una serie de pasos pequeños que partan de la capacidad `autenticacion` que deja este paso.
