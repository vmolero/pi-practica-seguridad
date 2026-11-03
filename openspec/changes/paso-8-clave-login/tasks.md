# Tareas

Requisito previo: `claves-usuario-en-alta` implementado y archivado (este
cambio usa `derivarClaves` y el formulario de alta con confirmación). Las
tareas [equipo] son la `KDF` definitiva con sal y pimienta; el resto es
[claude]. El grupo 2 fija el contrato; los grupos 3 a 7 pueden avanzar con la
implementación provisional.

## 1. Base de datos

- [x] 1.1 [claude] Crear la migración `server/migrations/<timestamp>_replace_password_with_login_key.cjs`: `up` quita `password` y añade `loginKeySalt` y `loginKeyHash` (texto, admiten `NULL`); `down` quita las dos y restaura `password` como texto no nulo con valor por defecto vacío
- [x] 1.2 [claude] Ampliar `server/test/database.test.js`: tras migrar no existe `password` y existen las dos columnas; las filas previas se conservan con `NULL`; el rollback restaura `password`

## 2. Servicio de clave de login (capa de seguridad)

- [x] 2.1 [claude] Escribir `server/test/login-key-service.contract.js` con `runLoginKeyServiceContractTests(createService)` según `design.md` D3: sales de 16 bytes aleatorias y distintas; `hash` determinista; distinto al cambiar sal, clave o pimienta; `verify` verdadero solo con la clave correcta y falso con hash de otra longitud; `TypeError` con `loginKey` que no sea `Uint8Array` de 16 bytes; `fakeSalt` determinista por email y distinta entre emails
- [x] 2.2 [claude] Crear `server/src/infrastructure/security/login-key-service.js` PROVISIONAL (cabecera marcada): scrypt de `node:crypto` con `N = 2^15`, `r = 8`, `p = 1`, 32 bytes; entrada `K_L ‖ pimienta`; `timingSafeEqual`; `fakeSalt` con HMAC-SHA-256; y `server/test/login-key-service.test.js` que ejecute la batería contra él
- [x] 2.3 [claude] Documentar el contrato, los parámetros provisionales y el reparto en `server/src/infrastructure/security/README.md`, junto al del servicio de tokens
- [ ] 2.4 [equipo] Decidir la `KDF` definitiva (scrypt con parámetros medidos, Argon2id o bcrypt) y sus parámetros, probando el tiempo en Windows y Linux; dejarlo escrito en el README del directorio y, si hace falta una librería, añadirla a `server/package.json`
- [ ] 2.5 [equipo] Sustituir la implementación provisional con la misma interfaz `createLoginKeyService`, sin tocar nada fuera de `server/src/infrastructure/security/`; añadir el *runner* del contrato para la nueva implementación y verificar que `npm test --workspace=server` pasa sin modificar `login-key-service.contract.js`; volver a sembrar

## 3. Configuración

- [x] 3.1 [claude] Añadir `loginPepper` a `loadConfig` en `server/src/config.js` según D7 (`LOGIN_PEPPER`: definida ≥ 16 caracteres; corta → error; ausente → pimienta de desarrollo y aviso) y los tres casos en `server/test/config.test.js`

## 4. Servidor: login con `K_L`

- [x] 4.1 [claude] Cambiar `parseLoginRequest` en `login-request.js` a `{ email, loginKey }`: `loginKey` base64 estándar que decodifica exactamente 16 bytes y recodifica igual; cualquier otro campo (incluido `password`) invalida la petición; devolver `loginKey` como `Uint8Array`. Actualizar `login-request.test.js`
- [x] 4.2 [claude] Cambiar `user-repository.findByEmail` para devolver `loginKeySalt` y `loginKeyHash` en lugar de `password`, y `create` para insertar las dos columnas; actualizar `user-repository.test.js`
- [x] 4.3 [claude] Cambiar `createAuthService({ userRepository, loginKeyService, tokenService })` según D6: `verify` con la sal del usuario; con email inexistente o `loginKeyHash` nulo, `verify` con `fakeSalt(email)` y un hash ficticio antes de lanzar `InvalidCredentialsError`. Actualizar `auth-service.test.js` con un `loginKeyService` falso que registre las llamadas
- [x] 4.4 [claude] Conectar `createLoginKeyService({ pepper: config.loginPepper })` en `server/index.js` y en `server/test/test-app.js`; añadir `loginKeyFor(password)` a `server/test/helpers.js` (importa `derivarClaves` del cliente)
- [x] 4.5 [claude] Actualizar `public-login.test.js`: login correcto de empleado y administrador con la `loginKey` derivada; clave incorrecta, email inexistente y usuario con hash nulo → `401` con el mismo cuerpo; `loginKey` de 15 bytes, no base64 o cuerpo con `password` → `400`; la respuesta no incluye hash ni sal

## 5. Servidor: alta con `K_L`

- [x] 5.1 [claude] Cambiar `parseCreateUserRequest` en `user-request.js`: quitar `password` de `CREATE_FIELDS` y sus reglas; añadir `loginKey` con la misma validación que en 4.1. Actualizar `user-request.test.js` (sin `loginKey` → null; con `password` → null; 15 bytes → null; válido → `Uint8Array`)
- [x] 5.2 [claude] Cambiar `user-admin-service.create` para recibir `loginKey`, generar `salt = newSalt()`, calcular `hash` y pasar `loginKeySalt` y `loginKeyHash` al repositorio; `createUserAdminService({ userRepository, loginKeyService })`. Actualizar `user-admin-service.test.js` (se guarda sal y hash, nunca `loginKey`; dos altas con la misma clave dan sales distintas)
- [x] 5.3 [claude] Actualizar `admin-users.test.js`: alta con `loginKey` → `201` sin hash ni sal, y el usuario creado inicia sesión con esa `loginKey`; alta con `password` → `400`

## 6. Cliente

- [x] 6.1 [claude] Ampliar `client/src/api/session.js` con `setDataKey`, `getDataKey` y `clearSession` (borra token y `K_D`); `http.js` llama a `clearSession()` ante `401`
- [x] 6.2 [claude] Cambiar `login()` en `client/src/api/auth.js`: `derivarClaves(password)`, enviar `{ email, loginKey: base64(K_L) }`, guardar token y `K_D` solo con `200`; `logout()` usa `clearSession()`. Comprobar en el navegador que la petición no lleva la contraseña y que no hay nada en `localStorage`, `sessionStorage` ni cookies
- [x] 6.3 [claude] Cambiar `createUser` en `client/src/api/admin-users.js` para enviar `loginKey` en lugar de `password`
- [x] 6.4 [claude] Cambiar `UserAdminPanel.jsx`: comprobar longitud 8–128 con el mensaje `La contraseña debe tener entre 8 y 128 caracteres` antes de la coincidencia; tras ambas, `derivarClaves(pw)` y `generarClavesUsuario(pw)`; enviar sin `password`; vaciar las contraseñas tras enviar
- [x] 6.5 [claude] Verificar en el navegador los escenarios de «Login desde la pantalla del cliente» y «Panel de administración en el cliente» de los deltas (login correcto, incorrecto, contraseña corta, no coinciden, alta y login del usuario nuevo) (comprobado el 3-nov-2026 con Chromium headless contra `npm run dev`; la contraseña corta obligó a quitar `minLength` de los campos para que se vea el mensaje del panel)

## 7. Semilla y script de ayuda

- [x] 7.1 [claude] Cambiar `server/seeds/01_usuarios_demo.cjs` según D9: importar `derivarClaves` y `createLoginKeyService`, leer la pimienta con `loadConfig`, y guardar sal y hash de `demo1234` y `admin1234`
- [x] 7.2 [claude] Crear `scripts/derivar-clave-login.mjs <contraseña>` que imprima `base64(K_L)`; comprobar que coincide con lo que envía el navegador para la misma contraseña
- [x] 7.3 [claude] Comprobar `db:migrate` + `db:seed` + login de los dos usuarios de demostración con y sin `LOGIN_PEPPER`, y que con pimientas distintas entre semilla y servidor el login da `401`. Probar en Windows o dejarlo anotado para el equipo (comprobado en Linux el 3-nov-2026; Windows pendiente, anotado en el README, apartado «Desarrollo»)

## 8. Documentación

- [x] 8.1 [claude] `README.md`: «Estado actual»; «Desarrollo» (volver a sembrar tras migrar; misma `LOGIN_PEPPER` para semilla y servidor); «Variables de entorno» (`LOGIN_PEPPER`); «Vista de login»; «API» (cuerpos de login y alta con `loginKey`, ejemplos de `curl` usando `node scripts/derivar-clave-login.mjs`); «Persistencia con SQLite» (tabla `USER`); verificar que los comandos documentados funcionan
- [x] 8.2 [claude] `docs/primera-memoria/implementacion-y-seguridad.md`: sección nueva «Clave de login con sal y pimienta (paso 8)» con la notación de `design.md`, el flujo del alta y del login, quién conoce cada dato, parámetros de la `KDF` provisional y «Lo que este paso no protege» (reutilización de `K_L`, SHA3 sin sal en el cliente, pimienta de desarrollo, sin límite de intentos); actualizar «Tabla `USER`», «Flujo de `POST /api/public/login`», «Lo que este paso no protege» de los pasos 1 y 6, «Estructura del proyecto» y «Trabajo futuro»
- [x] 8.3 [claude] `docs/primera-memoria/manual-de-usuario.md`: «Iniciar sesión» (la contraseña no sale del navegador) y «Dar de alta un usuario» (mensaje de longitud mínima)
- [x] 8.4 [claude] `docs/primera-memoria/stack-tecnologico.md`: `scrypt` y `timingSafeEqual` de `node:crypto` (o la librería que elija el equipo)
- [x] 8.5 [claude] `docs/diagrama-secuencia-alta-usuario.md` y `docs/diagrama-secuencia-login.md`: actualizar el «Estado» (`K_L`, `sal`, `pimienta` y `h_L` implantados; `c_kU`/`VI` en el login y la apertura de `k_U` siguen pendientes)
- [ ] 8.6 [equipo] Revisar la sección de la memoria, la notación y los parámetros de la `KDF` elegida antes de archivar

## 9. Verificación final

- [x] 9.1 [claude] `npm install`, `npm test --workspace=server`, `npm test --workspace=client`, `npm run dev`, login de empleado y administrador, alta desde el panel y login del usuario nuevo, cierre de sesión; ejecutar `openspec validate paso-8-clave-login --strict`

## Workflow follow-up

- Archivar con `/opsx:archive` cuando los grupos 1 a 9 estén hechos, incluidas
  las tareas [equipo] (si el equipo entrega más tarde, archivar con la
  provisional y abrir un cambio pequeño para la sustitución).
- Siguiente paso sugerido: devolver `K_U`, `VI` y `c_kU` en el login y abrir
  `k_U` con `K_D` en el navegador (`docs/diagrama-secuencia-login.md`), para
  poder cifrar las tarjetas.
- Al retomar `fase-1-registro-y-cifrado`, reescribir su derivación
  (PBKDF2 + HKDF) partiendo de `clave-login`.
