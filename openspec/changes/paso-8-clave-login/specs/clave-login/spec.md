# Spec Delta

## Purpose

Define cómo el navegador obtiene la clave de login `K_L` y la clave de datos
`K_D` a partir de la contraseña, cómo el servidor guarda y verifica `K_L` con
sal y pimienta sin conocer nunca la contraseña, y el contrato del servicio de
clave de login que separa la capa de seguridad del resto del servidor.

## ADDED Requirements

### Requirement: Descomposición de la contraseña en dos claves de 128 bits
El cliente SHALL derivar de la contraseña `pw` un resumen `h = SHA3-256(pw)` de
256 bits sobre su codificación UTF-8 y partirlo en dos cadenas de 128 bits:
`K_L = h[0..127]`, la clave de login, y `K_D = h[128..255]`, la clave de
datos. Solo `K_L` SHALL enviarse al servidor. `pw`, `h` y `K_D` SHALL NOT
salir del navegador, y `pw` y `h` SHALL borrarse de la memoria en cuanto se
hayan obtenido las dos mitades. La derivación SHALL ser la misma función
`derivarClaves(pw)` en el alta, en el login y en la semilla, de modo que la
misma contraseña produzca siempre las mismas `K_L` y `K_D`.

#### Scenario: Determinismo
- **WHEN** se deriva dos veces la misma contraseña
- **THEN** las dos derivaciones devuelven la misma `K_L` y la misma `K_D`, cada una de 16 bytes

#### Scenario: Independencia de las mitades
- **WHEN** se derivan dos contraseñas distintas
- **THEN** sus `K_L` son distintas y sus `K_D` son distintas

#### Scenario: Solo viaja la clave de login
- **WHEN** el cliente inicia sesión o da de alta un usuario
- **THEN** el cuerpo de la petición contiene `loginKey` (`K_L` en base64) y no contiene la contraseña ni `K_D`

### Requirement: Almacenamiento de la clave de login con sal y pimienta
La tabla `USER` SHALL guardar, en lugar de la contraseña, `loginKeySalt` (una
sal aleatoria de 16 bytes generada por el servidor, distinta para cada
usuario, en base64) y `loginKeyHash = KDF(K_L ‖ pimienta, sal)` (en base64),
donde `KDF` es una función de derivación lenta pensada para contraseñas
(scrypt, bcrypt o Argon2) y la pimienta es un secreto de la configuración del
servidor, igual para todos los usuarios y ausente de la base de datos. El
servidor SHALL descartar `K_L` en cuanto haya calculado el hash y SHALL NOT
guardarla ni escribirla en ningún registro. Una migración de Knex SHALL
eliminar la columna `password` y añadir las dos columnas nuevas, que admiten
`NULL`; su `down` SHALL restaurar `password`.

#### Scenario: Alta de un usuario
- **WHEN** se crea un usuario con una `loginKey`
- **THEN** su fila tiene `loginKeySalt` y `loginKeyHash` no nulos y ninguna columna contiene `loginKey` en claro

#### Scenario: Sales distintas para la misma clave de login
- **WHEN** se crean dos usuarios con la misma `loginKey`
- **THEN** sus `loginKeySalt` son distintas y sus `loginKeyHash` también

#### Scenario: La pimienta cambia el hash
- **WHEN** se calcula el hash de la misma `loginKey` con la misma sal y dos pimientas distintas
- **THEN** los dos hashes son distintos

#### Scenario: Migración sobre una base con usuarios
- **WHEN** se ejecuta `npm run db:migrate --workspace=server` sobre una base con usuarios creados antes del cambio
- **THEN** la tabla `USER` no tiene la columna `password` y tiene `loginKeySalt` y `loginKeyHash`
- **AND** los usuarios existentes se conservan con esas dos columnas a `NULL`

#### Scenario: Deshacer la migración
- **WHEN** se deshace la migración con `knex migrate:rollback`
- **THEN** la tabla `USER` vuelve a tener la columna `password` y no tiene `loginKeySalt` ni `loginKeyHash`

### Requirement: Verificación de la clave de login
Al recibir `{ email, loginKey }`, el servidor SHALL recalcular
`h'_L = KDF(K_L ‖ pimienta, loginKeySalt)` con la sal del usuario y comparar
`h'_L` con `loginKeyHash` en tiempo constante. Si el email no existe o el
usuario no tiene clave de login, el servidor SHALL calcular igualmente un
hash con una sal ficticia derivada del email, para tardar un tiempo similar,
y SHALL rechazar la petición. Cualquier rechazo SHALL producir la misma
respuesta que unas credenciales incorrectas.

#### Scenario: Clave de login correcta
- **WHEN** se envía la `loginKey` derivada de la contraseña del usuario
- **THEN** la verificación acepta y el servidor emite el token de sesión

#### Scenario: Clave de login incorrecta
- **WHEN** se envía una `loginKey` de 16 bytes distinta de la del usuario
- **THEN** la verificación rechaza con `401` y `{ "error": "Credenciales inválidas" }`

#### Scenario: Usuario sin clave de login
- **WHEN** se envía el email de un usuario cuya fila tiene `loginKeyHash` a `NULL` (creado antes del cambio)
- **THEN** el servidor responde `401` con el mismo cuerpo que ante una clave incorrecta

#### Scenario: Email inexistente
- **WHEN** se envía un email que no pertenece a ningún usuario
- **THEN** el servidor calcula el hash con la sal ficticia de ese email y responde `401` con el mismo cuerpo

### Requirement: Pimienta en la configuración del servidor
El servidor SHALL leer la pimienta de la variable de entorno `LOGIN_PEPPER`.
Si está definida, SHALL tener al menos 16 caracteres; si no, el arranque
SHALL fallar con un mensaje claro. Si no está definida, el servidor SHALL
usar una pimienta fija de desarrollo y avisar en la consola de que la
pimienta no protege nada. La semilla SHALL usar la misma regla, de modo que
los usuarios sembrados puedan iniciar sesión en el servidor arrancado con la
misma configuración.

#### Scenario: Pimienta definida
- **WHEN** `LOGIN_PEPPER` tiene 16 caracteres o más
- **THEN** `loadConfig` devuelve ese valor como `loginPepper` sin avisos

#### Scenario: Pimienta demasiado corta
- **WHEN** `LOGIN_PEPPER` tiene menos de 16 caracteres
- **THEN** `loadConfig` lanza un error que menciona `LOGIN_PEPPER`

#### Scenario: Pimienta ausente
- **WHEN** `LOGIN_PEPPER` no está definida
- **THEN** `loadConfig` devuelve la pimienta de desarrollo y emite un aviso en la consola

#### Scenario: Semilla y servidor con pimientas distintas
- **WHEN** se siembra con una `LOGIN_PEPPER` y se arranca el servidor con otra
- **THEN** los usuarios de demostración no pueden iniciar sesión (`401`)

### Requirement: Contrato del servicio de clave de login
El hash, la verificación y la sal ficticia SHALL estar detrás de un servicio
con la interfaz `createLoginKeyService({ pepper })` →
`{ newSalt(), hash(loginKey, salt), verify(loginKey, salt, expectedHash),
fakeSalt(email) }`, donde `loginKey` es un `Uint8Array` de 16 bytes y `salt` y
`expectedHash` son cadenas en base64. Cualquier implementación (la provisional
de Claude o la definitiva del equipo) SHALL superar la misma batería de tests
de contrato sin modificarla: sales aleatorias y distintas, hash determinista
para los mismos argumentos, hash distinto al cambiar la sal, la clave o la
pimienta, `verify` verdadero solo con la clave correcta, rechazo de claves de
longitud distinta de 16 bytes y `fakeSalt` determinista para un email y
distinta entre emails.

#### Scenario: Implementación provisional
- **WHEN** se ejecuta la batería de contrato contra la implementación provisional
- **THEN** todos los tests pasan

#### Scenario: Implementación del equipo
- **WHEN** el equipo sustituye la implementación provisional y se ejecuta la misma batería sin modificarla
- **THEN** todos los tests pasan y el resto de la aplicación no cambia

### Requirement: Usuarios de demostración con clave de login
La semilla de desarrollo SHALL crear los usuarios de demostración con
`loginKeySalt` y `loginKeyHash` calculados a partir de su contraseña de prueba
con el mismo `derivarClaves` del navegador y el mismo servicio de clave de
login del servidor. Un script de la raíz SHALL imprimir la `loginKey` en
base64 de una contraseña dada, para poder llamar a la API con `curl`.

#### Scenario: Semilla aplicada
- **WHEN** se ejecuta `npm run db:seed --workspace=server` y se arranca el servidor con la misma `LOGIN_PEPPER`
- **THEN** `empleado@empresa.com` inicia sesión con la `loginKey` derivada de `demo1234` y `admin@empresa.com` con la de `admin1234`

#### Scenario: Script de ayuda
- **WHEN** se ejecuta `node scripts/derivar-clave-login.mjs demo1234`
- **THEN** imprime la misma `loginKey` en base64 que calcula el navegador para `demo1234`
