# Tareas

Cada tarea lleva su responsable: **[equipo]** (capa de seguridad, la
implementan los alumnos) o **[claude]** (resto del sistema). Una vez cerrado el
grupo 1, los grupos 3 y 4 (equipo) avanzan en paralelo con los grupos 2, 5, 6
y 7 (Claude), que funcionan sobre los stubs hasta que llega la implementación
real.

## 1. Frontera de la capa de seguridad

- [ ] 1.1 [equipo] Revisar y aprobar la interfaz de D1 y los algoritmos de D2 en `design.md`, anotando en el propio documento los cambios que se decidan; verificación: `design.md` refleja la versión acordada.
- [ ] 1.2 [claude] Crear `client/src/security/` y `server/security/` con `index.js` (que reexporta `stub.js`), `stub.js` y `errors.js` (`IntegrityError` y `ServerIdentityError`), siguiendo la interfaz acordada; verificación: el servidor arranca con un aviso de stub y con `NODE_ENV=production` se niega a arrancar.
- [ ] 1.3 [claude] Separar `server/index.js` en `app.js` (la aplicación Express) e `index.js` (arranque), añadir `npm test` en la raíz con `node:test` para cliente y servidor, y escribir las pruebas de contrato de ambas capas, separando las de funcionamiento de las de seguridad; verificación: `npm test` pasa las de funcionamiento con el stub y lista como pendientes las de seguridad.
- [ ] 1.4 [claude] Mostrar en la interfaz la franja «Capa de seguridad provisional: no uses datos reales» cuando el cliente use el stub; verificación: la franja aparece con el stub y desaparece al reexportar una implementación que no lo sea.

## 2. Infraestructura

- [ ] 2.1 [claude] Crear `npm run setup` como script de Node sin dependencias de shell: genera, a través de `server/security`, el almacén de claves cifrado del servidor en `server/keys/`, el certificado TLS de desarrollo (`selfsigned`) y `client/src/security/server-public-key.js`, y añade `server/keys/` y `.env` a `.gitignore`; verificación: ejecutarlo dos veces no sobrescribe nada sin `--force` y funciona en Windows.
- [ ] 2.2 [claude] Servir Vite y Express por HTTPS con el certificado de desarrollo, cargar la configuración con `node --env-file=.env` y añadir `.env.example`; verificación: `npm run dev` abre `https://localhost:5173` y `GET /api/health` responde por HTTPS.
- [ ] 2.3 [claude] Añadir `helmet` con una CSP estricta, HSTS, `nosniff` y `Referrer-Policy`, y un límite de tamaño para los cuerpos JSON; verificación: una prueba comprueba las cabeceras y el rechazo de un cuerpo demasiado grande.
- [ ] 2.4 [claude] Crear la migración del esquema de D5, que sustituye `USER`, y eliminar `notes` (tabla, `database.js` y `/api/notes`) pasando todo el acceso a datos a Knex; verificación: `db:migrate` y `db:rollback` funcionan sobre una base vacía y `GET /api/notes` responde 404.
- [ ] 2.5 [claude] Actualizar `README.md` con `setup`, HTTPS, `.env`, `npm test` y los nuevos comandos; verificación: los comandos funcionan tal como están escritos en un clon limpio.

## 3. Capa de seguridad del servidor

- [ ] 3.1 [equipo] Implementar `hashAuthKey` y `verifyAuthKey` (scrypt con sal, comparación en tiempo constante); verificación: pasan sus pruebas de contrato, incluidas las de seguridad.
- [ ] 3.2 [equipo] Implementar la generación y `loadServerKeys` del almacén de claves (par ECDSA del servidor, `K_srv` y `K_fake`, cifrados con la frase de paso); verificación: con una frase incorrecta falla sin revelar datos, y `npm run setup` usa esta implementación.
- [ ] 3.3 [equipo] Implementar `sealServerData`, `openServerData` y `fakeKdfParams`; verificación: las pruebas de manipulación y de sal determinista pasan.
- [ ] 3.4 [equipo] Implementar `newToken` y `hashToken`; verificación: las pruebas de longitud y unicidad pasan.
- [ ] 3.5 [equipo] Implementar `newTotpSecret` y `verifyTotp` con tolerancia de ±1 periodo y rechazo de códigos reutilizados; verificación: pasan los vectores de prueba del RFC 6238 y la prueba de reutilización.
- [ ] 3.6 [equipo] Implementar `newChallenge`, `verifyChallengeResponse` e `issueCertificate` con una serialización canónica; verificación: un reto firmado por el servidor se verifica con la clave pública exportada y una firma alterada se rechaza.
- [ ] 3.7 [equipo] Cambiar `server/security/index.js` para que reexporte la implementación real; verificación: `npm test` pasa todas las pruebas del servidor y el aviso de stub desaparece.

## 4. Capa de seguridad del cliente

- [ ] 4.1 [equipo] Implementar `newKdfSalt` y `deriveKeys` (PBKDF2 + HKDF); verificación: los vectores de prueba fijos dan las mismas `authKey` en el navegador y en Node.
- [ ] 4.2 [equipo] Implementar `generateUserKeys`, `sealPrivateKeys` y `openPrivateKeys`; verificación: ida y vuelta correcta, e `IntegrityError` con un byte alterado, con otro `userId` o con otra contraseña.
- [ ] 4.3 [equipo] Implementar `verifyServerChallenge`, `signChallenge` y `verifyCertificate`; verificación: una prueba cruzada verifica en el cliente un reto y un certificado emitidos por `server/security`, y el servidor verifica la firma del cliente.
- [ ] 4.4 [equipo] Implementar `encryptCard` y `decryptCard`; verificación: dos cifrados de los mismos datos son distintos, e `IntegrityError` si se alteran los datos o se cambia `cardId` u `ownerId`.
- [ ] 4.5 [equipo] Cambiar `client/src/security/index.js` para que reexporte la implementación real; verificación: `npm test` pasa todas las pruebas del cliente y la franja de aviso desaparece.

## 5. Gestión de usuarios

- [ ] 5.1 [claude] Crear el script `create-admin` que da de alta el primer gestor e imprime su enlace de activación; verificación: una prueba cubre el alta en una base vacía y el rechazo de un email duplicado.
- [ ] 5.2 [claude] Implementar `POST /api/invitations`, `GET /api/users` y `PATCH /api/users/:id` con control de rol, invitaciones que caducan a las 72 h y desactivación que invalida las sesiones; verificación: las pruebas de integración cubren todos los escenarios de `specs/gestion-usuarios`.
- [ ] 5.3 [claude] Implementar `GET /api/invitations/:token`, `POST /api/invitations/:token/totp` y `POST /api/invitations/:token/activate`, con emisión del certificado; verificación: las pruebas cubren la activación correcta, el token caducado o usado y la activación interrumpida.
- [ ] 5.4 [claude] Crear la vista de activación: datos de la invitación, contraseña con su política y su confirmación, aviso de que no hay recuperación, QR del TOTP y confirmación del código; verificación: un usuario invitado completa el alta en el navegador y queda activo.
- [ ] 5.5 [claude] Crear la vista de gestión de usuarios para el gestor (lista, invitar, desactivar y reactivar), oculta para los empleados; verificación: el gestor obtiene un enlace de invitación y el empleado no ve la sección.
- [ ] 5.6 [claude] Documentar la activación y la gestión de usuarios en `docs/primera-memoria/manual-de-usuario.md`; verificación: el manual sigue el flujo real de la interfaz.

## 6. Autenticación

- [ ] 6.1 [claude] Implementar `POST /api/auth/prelogin`, `/login`, `/totp` y `/response` con el estado del intento de login (caducidad de 2 min y retos de un solo uso) y el error genérico único; verificación: las pruebas de integración cubren los escenarios de `specs/autenticacion`, incluidos el email inexistente, la cuenta desactivada y el TOTP reutilizado.
- [ ] 6.2 [claude] Implementar sesiones (cookie `HttpOnly`/`Secure`/`SameSite=Strict`, hash en la base de datos, inactividad de 30 min y máximo de 8 h), `/logout`, `/unlock` y `GET /api/auth/session`; verificación: las pruebas cubren la caducidad y la reutilización de una cookie tras cerrar sesión.
- [ ] 6.3 [claude] Implementar la limitación de intentos por cuenta y por IP en SQLite; verificación: una prueba confirma el bloqueo tras 5 fallos y el desbloqueo a los 15 min (con reloj simulado).
- [ ] 6.4 [claude] Reescribir `client/src/api/auth.js` y el login en tres pasos, la vista de desbloqueo y el contexto de claves en memoria que se vacía al cerrar sesión, eliminando las credenciales de prueba; verificación: login completo en el navegador, y la pestaña de red y el almacenamiento no muestran ni la contraseña ni las claves.
- [ ] 6.5 [claude] Actualizar en `docs/primera-memoria/` el contrato de la API y el manual de login (sin la parte de notación criptográfica); verificación: la documentación ya no menciona `POST /api/login` con contraseña ni las credenciales de prueba.

## 7. Bóveda de tarjetas

- [ ] 7.1 [claude] Implementar `/api/cards` (listar, crear con UUID del cliente, ver, editar con control de versión y borrar) devolviendo 404 para las tarjetas ajenas; verificación: las pruebas de integración cubren los escenarios de `specs/boveda-tarjetas` que dependen del servidor.
- [ ] 7.2 [claude] Crear la lista y el formulario de tarjetas: validación (Luhn, caducidad, sin CVV), número enmascarado con opción de mostrarlo, tarjeta dañada mostrada aparte y confirmación del borrado; verificación: pruebas unitarias de los validadores y comprobación manual del flujo completo.
- [ ] 7.3 [claude] Documentar la bóveda en el manual de usuario; verificación: el manual cubre alta, edición, borrado y el mensaje de tarjeta dañada.

## 8. Memoria y verificación final

- [ ] 8.1 [equipo] Escribir el capítulo del protocolo de seguridad en `docs/primera-memoria/implementacion-y-seguridad.md` con notación inequívoca, partiendo del borrador de D3; verificación: cada proceso seguro (activación, login, desbloqueo, tarjeta) tiene su secuencia completa.
- [ ] 8.2 [equipo] Completar en `docs/primera-memoria/stack-tecnologico.md` las librerías y algoritmos criptográficos usados; verificación: coincide con D2 y con el código.
- [ ] 8.3 [claude] Escribir un script de comprobación que vuelque la base de datos y confirme que no aparecen en claro ni la contraseña, ni la clave de autenticación, ni las claves privadas, ni ningún dato de las tarjetas creadas en una prueba de extremo a extremo; verificación: el script termina sin hallazgos con la implementación real.
- [ ] 8.4 [claude] Probar la instalación y el flujo completo en Windows (`npm install`, `setup`, `db:migrate`, `create-admin`, activación, login y tarjetas); verificación: registro de la prueba con los problemas encontrados resueltos.
- [ ] 8.5 [equipo] Grabar el vídeo de demostración de la fase 1 (máximo 5 minutos) y entregar la primera memoria antes del 2026-11-01; verificación: entrega subida a UACloud.
- [ ] 8.6 [claude] Ejecutar `openspec validate fase-1-registro-y-cifrado --strict`; verificación: termina sin errores.

## Workflow follow-up

- Archivar el cambio cuando la fase 1 esté entregada y revisada.
- Abrir la propuesta de la fase 2: compartir tarjetas, tarjetas y contratos de empresa, y rotación de claves.
