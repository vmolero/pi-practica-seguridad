## 1. Base de datos

- [x] 1.1 [claude] Crear la migración `server/migrations/<timestamp>_add_keys_to_user.cjs`, que añade `publicKey`, `encryptedPrivateKey` y `privateKeyIv` (texto, admiten `NULL`) a `USER`, con un `down` que las elimina
- [x] 1.2 [claude] Ampliar `server/test/database.test.js`: las columnas existen tras migrar, las filas previas se conservan con `NULL` y el rollback las quita

## 2. Módulo de claves del usuario (capa de seguridad)

- [x] 2.1 [claude] Crear `client/src/security/claves-usuario.js` con la interfaz de `design.md` (D3): `derivarClaves`, `generarClavesUsuario` y `abrirClavePrivada`. La implementación provisional va marcada como **PROVISIONAL**: usa SHA-256 en lugar de SHA3-256 y solo depende de `globalThis.crypto`
- [x] 2.2 [claude] Escribir las pruebas de contrato en `client/src/security/claves-usuario.test.js` (`node --test`):
  - ida y vuelta (cifrar con `publicKey` y descifrar con la privada abierta);
  - con una contraseña incorrecta la apertura falla;
  - dos altas con la misma contraseña dan `VI` y claves distintos;
  - longitudes: `VI` de 16 bytes, RSA de 2048 bits, `K_L` y `K_D` de 16 bytes
- [ ] 2.3 [equipo] Decidir la implementación de SHA3-256: `@noble/hashes` o una propia. Si es la librería, añadirla a `client/package.json`
- [ ] 2.4 [equipo] Sustituir la implementación provisional por la definitiva:
  - `h = SHA3-256(pw)`, con `K_L = h[0..127]` y `K_D = h[128..255]`;
  - RSA-OAEP 2048 con `e = 65537`;
  - AES-128-CBC sobre el PKCS#8 con `VI` aleatorio.

  Quitar las marcas PROVISIONAL y comprobar que las pruebas de 2.2 siguen
  pasando
- [ ] 2.5 [equipo] Revisar que el módulo borra las referencias a `pw`, `h`, `K_D` y a la clave privada exportada en cuanto deja de necesitarlas

## 3. Servidor: validación, servicio y repositorio

- [x] 3.1 [claude] Ampliar `parseCreateUserRequest` en `server/src/infrastructure/http/user-request.js`, según D5, con `publicKey` (SPKI RSA de al menos 2048 bits, comprobado con `node:crypto`), `privateKeyIv` (16 bytes) y `encryptedPrivateKey` (16–4096 bytes, múltiplo de 16)
- [x] 3.2 [claude] Pasar los tres campos por `user-admin-service.create` hasta `user-repository.create`, insertándolos sin añadirlos a `ADMIN_COLUMNS` ni al `returning`
- [x] 3.3 [claude] Actualizar las pruebas:
  - `user-request.test.js`: sin claves → null; clave de 1024 bits → null; `VI` de 12 bytes → null; claves válidas → ok;
  - `user-admin-service.test.js` y `user-repository.test.js`: se guardan los valores exactos y no se devuelven;
  - `admin-users.test.js`: el `201` no trae claves, un alta sin claves da `400` y la lista no expone claves
- [x] 3.4 [claude] Añadir a `server/test/helpers.js` un generador de claves de prueba válidas para no repetirlo en cada test

## 4. Cliente: panel de administración

- [x] 4.1 [claude] Añadir el campo «Repite la contraseña» a `UserAdminPanel.jsx`. Si no coincide, mostrar `Las contraseñas no coinciden` en el área de alerta sin hacer ninguna petición
- [x] 4.2 [claude] Al enviar: `generarClavesUsuario(pw)` y después `createUser` con los tres campos. El botón muestra «Generando claves…» mientras dura, y si hay un error se vacían las dos contraseñas y se conserva lo demás
- [x] 4.3 [claude] Actualizar `client/src/api/admin-users.js` para que `createUser` envíe los campos de clave

## 5. Semilla

- [x] 5.1 [claude] Hacer que `server/seeds/01_usuarios_demo.cjs` importe el módulo del cliente y guarde las claves de `empleado@empresa.com` (`demo1234`) y `admin@empresa.com` (`admin1234`)
- [x] 5.2 [claude] Comprobar a mano que `db:migrate` + `db:seed` funcionan y que la clave privada de cada usuario de la semilla se abre con su contraseña. Probar también en Windows, o dejarlo anotado para el equipo (comprobado en Linux el 3-nov-2026; Windows pendiente, anotado en el README, apartado «Desarrollo»)

## 6. Documentación

- [x] 6.1 [claude] `README.md`:
  - «Desarrollo»: la semilla genera claves y hay que volver a sembrar tras migrar;
  - «API»: el nuevo cuerpo del alta y el ejemplo de `curl` (indicar que las claves las genera el cliente; para `curl`, usar las que imprime un script de ayuda o remitir al panel);
  - «Estado actual»
- [x] 6.2 [claude] `docs/primera-memoria/implementacion-y-seguridad.md`:
  - nueva sección «Claves del usuario (paso 7)», con notación, parámetros y justificación, qué guarda la tabla y quién conoce cada dato, y «Lo que este paso no protege» (contraseña aún en claro, SHA3 sin sal, CBC sin autenticación);
  - actualizar «Tabla `USER`», «Estructura del proyecto» y «Trabajo futuro»
- [x] 6.3 [claude] `docs/primera-memoria/manual-de-usuario.md`, apartado «Dar de alta un usuario»: confirmación de la contraseña y aviso de que se están generando las claves
- [x] 6.4 [claude] `docs/diagrama-secuencia-alta-usuario.md`: actualizar el «Estado», indicando que el par de claves y `c_kU` ya están implantados y que `K_L`/`h_L` siguen pendientes
- [x] 6.5 [claude] `docs/primera-memoria/stack-tecnologico.md`: añadir Web Crypto (RSA-OAEP, AES-CBC) y la librería de SHA3 si se adopta
- [ ] 6.6 [equipo] Revisar la sección de la memoria y la notación antes de archivar
