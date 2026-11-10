# Tareas

Requisito previo: `claves-usuario-en-alta` y `paso-8-clave-login`
implementados. Todo es [claude] salvo la revisión final; no hay migración ni
cambios en la semilla. Orden: módulo de seguridad del cliente → sesión →
servidor → login en el cliente → vista → verificación → documentación.

## 1. Módulo de seguridad del cliente

- [x] 1.1 [claude] En `client/src/security/claves-usuario.js`, extraer `abrirClavePrivadaConKD(K_D, { encryptedPrivateKey, privateKeyIv })` (devuelve la `CryptoKey` privada no exportable con uso `decrypt`; lanza `ClavePrivadaError`) y dejar `abrirClavePrivada(pw, …)` como envoltura que deriva `K_D`, la pasa y la borra
- [x] 1.2 [claude] Añadir `comprobarParDeClaves(publicKey, privateKey)` según `design.md` D3: `r` de 32 bytes aleatorios, `D_k_U(E_K_U(r)) === r`, `false` ante cualquier excepción; exportar `PRIVATE_KEY_CHECK_LENGTH` o equivalente solo si hace falta en tests
- [x] 1.3 [claude] Ampliar `client/src/security/claves-usuario.test.js`: apertura con `K_D` da una clave que descifra lo cifrado con `publicKey`; `comprobarParDeClaves` es `true` con el par propio y `false`, sin excepción, con la privada de otro par; la clave abierta tiene `extractable === false`

## 2. Sesión en memoria

- [x] 2.1 [claude] Ampliar `client/src/api/session.js` con `setUserKeys({ publicKey, privateKey })`, `getUserKeys()` y hacer que `clearSession()` ponga también las claves a `null`; actualizar el comentario de cabecera (`K_D` solo hasta abrir `k_U`)
- [x] 2.2 [claude] Crear `client/src/api/session.test.js` (`node --test`): `getUserKeys` es `null` al inicio, devuelve lo guardado tras `setUserKeys`, y `clearSession` borra token, `K_D` (rellenada a ceros) y claves

## 3. Servidor: claves en la respuesta del login

- [x] 3.1 [claude] `server/src/infrastructure/database/user-repository.js`: `findByEmail` selecciona también `publicKey`, `encryptedPrivateKey` y `privateKeyIv`; ampliar `user-repository.test.js`
- [x] 3.2 [claude] `server/src/domain/user.js`: `toUserKeys(user)` → `{ publicKey, privateKeyIv, encryptedPrivateKey }` o `null` si falta alguna; test en `user.test.js`
- [x] 3.3 [claude] `server/src/application/auth-service.js`: `login` devuelve `{ token, user, keys: toUserKeys(user) }` solo tras `verify` verdadero; ampliar `auth-service.test.js` (claves del repositorio, `null` si falta alguna, nunca sal ni hash, nada de `keys` en los caminos que lanzan `InvalidCredentialsError`)
- [x] 3.4 [claude] `server/test/public-login.test.js`: el `200` de empleado y administrador trae `keys` iguales a su fila en `USER`; el `401` no trae `keys`; un usuario con `encryptedPrivateKey` a `NULL` recibe `keys: null`; la respuesta sigue sin `loginKeySalt` ni `loginKeyHash`. Comprobar que `admin-users.test.js` sigue verificando que las respuestas de administración no llevan claves

## 4. Cliente: login abre la clave privada

- [x] 4.1 [claude] `client/src/api/auth.js`: tras el `200`, si `keys` es `null` lanzar `PRIVATE_KEY_ERROR`; si no, `abrirClavePrivadaConKD`, `importarClavePublica`, `comprobarParDeClaves`; con éxito `setToken` y `setUserKeys`; en cualquier fallo no guardar el token y lanzar `PRIVATE_KEY_ERROR` (`No se ha podido abrir tu clave privada. Vuelve a intentarlo.`); `K_D.fill(0)` en `finally`
- [x] 4.2 [claude] Comprobar que `LoginForm.jsx` muestra el mensaje nuevo igual que los demás (ya usa `error.message`) y que vacía la contraseña

## 5. Vista de sesión

- [x] 5.1 [claude] `client/src/components/SessionView.jsx`: fila `Clave privada` con valor `Abierta en este navegador` cuando `getUserKeys()` no es `null`

## 6. Verificación en el navegador

- [x] 6.1 [claude] Con `npm run dev`: login de empleado y administrador muestra la fila `Clave privada: Abierta en este navegador`; desde la consola, `localStorage`, `sessionStorage` y `document.cookie` vacíos; cerrar sesión vuelve al login; volver a entrar funciona
- [x] 6.2 [claude] Caso de fallo: poner `encryptedPrivateKey` a un valor corrupto (base64 de 16 bytes aleatorios) para `empleado@empresa.com` en `server/data/app.sqlite`, comprobar el mensaje `No se ha podido abrir tu clave privada. Vuelve a intentarlo.` y que no se entra en sesión; restaurar con `npm run db:seed --workspace=server`
  *(Verificado el 10-nov-2026 con Chromium headless (Playwright); la extensión de Chrome no acepta el certificado autofirmado.)*
- [x] 6.3 [claude] `npm test --workspace=server`, `npm test --workspace=client`, `openspec validate paso-9-abrir-clave-privada-en-login --strict`
  *(10-nov-2026: servidor 233/233, cliente 29/29, cambio válido.)*

## 7. Documentación

- [x] 7.1 [claude] `README.md`: «Estado actual» / «Seguridad» (el navegador abre `k_U` en el login y borra `K_D`); «Vista de login» (qué guarda `session.js`: token, `K_U`, `k_U`; nuevo mensaje de error); «API» (respuesta de login con `keys`, ejemplo de `curl` mostrando que trae `publicKey`, `privateKeyIv`, `encryptedPrivateKey`)
- [x] 7.2 [claude] `docs/primera-memoria/implementacion-y-seguridad.md`: sección nueva «Apertura de la clave privada en el login (paso 9)» con el flujo, la comprobación con `r`, quién conoce cada dato y «Lo que este paso no protege» (`c_kU` sin integridad, `K_U` sin firmar, `k_U` expuesta a XSS, sin CSP); actualizar «Flujo de `POST /api/public/login`», «Lo que este paso no protege» de los pasos 7 y 8 (marcar lo resuelto) y «Trabajo futuro»
- [x] 7.3 [claude] `docs/primera-memoria/manual-de-usuario.md`: «Iniciar sesión» (fila `Clave privada`, mensaje de error nuevo y qué hacer: volver a intentarlo o avisar al administrador)
- [x] 7.4 [claude] `docs/criptografia-implementada.md`: añadir `abrirClavePrivadaConKD` y `comprobarParDeClaves` a «Dónde está el código», los pasos 3 a 5 del login en el navegador, el ejemplo (apertura con `K_D` y comprobación del par, con un snippet reproducible) y la tabla «Qué es provisional y qué falta» (uso de `K_D` en el login → hecho; cifrado de tarjetas → siguiente)
- [x] 7.5 [claude] `docs/diagrama-secuencia-login.md`: «Estado» pasa a implantado (con `H` y `KDF` provisionales) y el nombre del campo `keys` en el paso 200; `docs/primera-memoria/stack-tecnologico.md`: nota de que RSA-OAEP de Web Crypto se usa ya en el login
- [ ] 7.6 [equipo] Revisar la sección de la memoria y la comprobación del par antes de archivar

## Workflow follow-up

- Archivar con `/opsx:archive` cuando los grupos 1 a 7 estén hechos. Este
  cambio no depende de las tareas [equipo] pendientes de los pasos 7 y 8
  (SHA3-256, KDF definitiva): programa contra las mismas interfaces.
- Siguiente paso sugerido: cifrar las tarjetas en el navegador con una clave
  AES aleatoria por tarjeta envuelta con `K_U` (`docs/diagrama-secuencia-crear-tarjeta.md`),
  con migración de `CARD`.
- Anotar para más adelante: firma de `K_U` y AES-GCM para `c_kU`, CSP, y
  recuperar las claves en `GET /api/private/me` si se quiere mantener la
  sesión al recargar.
