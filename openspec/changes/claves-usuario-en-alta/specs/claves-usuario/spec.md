## ADDED Requirements

### Requirement: Columnas de claves en la tabla USER
La base de datos SHALL tener en la tabla `USER` tres columnas de texto que
admiten `NULL`:
- `publicKey`: la clave pública `K_U` en formato SPKI DER codificado en base64;
- `encryptedPrivateKey`: `c_kU`, la clave privada cifrada, en base64;
- `privateKeyIv`: el `VI` de 16 bytes, en base64.

Una migración de Knex SHALL añadirlas sin perder las filas existentes, que
quedan con las tres columnas a `NULL`. Su `down` SHALL eliminarlas.

#### Scenario: Migración sobre una base con usuarios
- **WHEN** se ejecuta `npm run db:migrate --workspace=server` sobre una base con usuarios creados antes del cambio
- **THEN** la tabla `USER` tiene las columnas `publicKey`, `encryptedPrivateKey` y `privateKeyIv`
- **AND** los usuarios existentes se conservan, con esas columnas a `NULL`

#### Scenario: Deshacer la migración
- **WHEN** se deshace la migración con `knex migrate:rollback`
- **THEN** la tabla `USER` vuelve a tener solo `id`, `name`, `email`, `password` e `isAdmin`, con sus filas intactas

### Requirement: Generación del par de claves en el navegador
El cliente SHALL generar el par de claves del usuario en el navegador, sin
enviar `pw`, `K_D` ni `k_U` al servidor:
1. `h = SHA3-256(pw)`, de 256 bits, sobre la codificación UTF-8 de `pw`.
2. `K_D = h[128..255]`, los 128 bits bajos de `h`.
3. Par RSA-OAEP con módulo de 2048 bits, `e = 65537` y SHA-256: `K_U` es la
   clave pública y `k_U` la privada.
4. `VI`: 16 bytes de un generador aleatorio criptográfico, distinto en cada
   alta.
5. `c_kU = E_K_D(k_U)`: AES-128-CBC sobre la clave privada exportada en PKCS#8.

El módulo SHALL devolver `{ publicKey, encryptedPrivateKey, privateKeyIv }` en
base64 y SHALL ofrecer la operación inversa: con `pw` y
`{ encryptedPrivateKey, privateKeyIv }`, recuperar `k_U`.

#### Scenario: Ida y vuelta con la contraseña correcta
- **WHEN** se generan las claves con `pw = "inicial123"` y después se abre `encryptedPrivateKey` con la misma `pw` y el mismo `privateKeyIv`
- **THEN** se obtiene una clave privada que descifra lo que se cifra con `publicKey` mediante RSA-OAEP

#### Scenario: Contraseña incorrecta
- **WHEN** se intenta abrir `encryptedPrivateKey` con una contraseña distinta de la usada al generarla
- **THEN** la operación falla y no devuelve ninguna clave privada

#### Scenario: VI distinto en cada alta
- **WHEN** se generan dos veces las claves con la misma contraseña
- **THEN** los dos `privateKeyIv` son distintos y las dos `publicKey` también

#### Scenario: El servidor no recibe secretos
- **WHEN** el panel envía el alta de un usuario
- **THEN** el cuerpo de la petición contiene `publicKey`, `encryptedPrivateKey` y `privateKeyIv`, pero no `K_D` ni la clave privada en claro

### Requirement: La clave privada cifrada no sale del servidor por la API de administración
El servidor SHALL guardar `publicKey`, `encryptedPrivateKey` y `privateKeyIv`
tal y como los recibe en un alta válida. Ninguna respuesta de
`/api/private/admin/users` ni de `/api/public/login` SHALL incluir ninguno de
los tres campos.

#### Scenario: Alta guarda las claves
- **WHEN** un administrador da de alta un usuario con campos de clave válidos
- **THEN** la fila del usuario en `USER` contiene exactamente los tres valores enviados

#### Scenario: Respuestas sin material de claves
- **WHEN** un administrador lista los usuarios o da de alta uno
- **THEN** cada usuario de la respuesta contiene solo `id`, `name`, `email` e `isAdmin`

### Requirement: Usuarios de demostración con claves
La semilla de desarrollo SHALL crear los usuarios de demostración con su par
de claves, generado con el mismo módulo y el mismo esquema que el navegador a
partir de su contraseña de prueba.

#### Scenario: Semilla aplicada
- **WHEN** se ejecuta `npm run db:seed --workspace=server`
- **THEN** `empleado@empresa.com` y `admin@empresa.com` tienen `publicKey`, `encryptedPrivateKey` y `privateKeyIv` no nulos
- **AND** la clave privada de cada uno se abre con su contraseña de prueba
