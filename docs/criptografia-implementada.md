# La criptografía que ya está en el código

Esta página explica, sin entrar en teoría, qué código criptográfico tiene la
aplicación hoy (pasos 7 y 8), dónde está y qué pasa cuando alguien se da de
alta o inicia sesión. Al final hay un ejemplo con valores reales que puedes
reproducir en tu máquina.

Si quieres la justificación de cada decisión, está en
[implementación y seguridad](primera-memoria/implementacion-y-seguridad.md),
secciones «Claves del usuario (paso 7)» y «Clave de login con sal y pimienta
(paso 8)». Los símbolos (`K_L`, `K_D`, `c_kU`…) son los del
[glosario de los diagramas](glosario-simbolos-diagramas.md).

## La idea en tres líneas

1. La contraseña **no sale del navegador**. El navegador la convierte en un
   resumen de 256 bits y lo parte en dos mitades de 128 bits.
2. La primera mitad, la **clave de login** `K_L`, es lo único que viaja al
   servidor. El servidor no la guarda: guarda un hash lento de ella con una
   sal por usuario y una pimienta secreta.
3. La segunda mitad, la **clave de datos** `K_D`, se queda en el navegador y
   sirve para cifrar la clave privada RSA del usuario. El servidor guarda esa
   clave privada cifrada, pero no puede abrirla.

```
contraseña ──H──▶ h (32 bytes) ──┬── h[0..15]  = K_L ──▶ viaja al servidor ──▶ h_L = scrypt(K_L ‖ pimienta, sal)
                                 └── h[16..31] = K_D ──▶ se queda en el navegador ──▶ c_kU = AES-CBC(K_D, k_U)
```

## Dónde está el código

| Fichero | Qué hace | Cuándo se ejecuta |
|---|---|---|
| `client/src/security/claves-usuario.js` | `derivarClaves(pw)` → `{ K_L, K_D }`. `generarClavesUsuario(pw)` → par RSA y clave privada cifrada. `abrirClavePrivada(pw, …)` hace la inversa. | En el navegador, en el alta y en el login. También en Node (semilla y scripts). |
| `server/src/infrastructure/security/login-key-service.js` | `newSalt()`, `hash(K_L, sal)`, `verify(K_L, sal, hash)`, `fakeSalt(email)`. | En el servidor, en el alta y en el login. |
| `server/src/config.js` | Lee la pimienta de `LOGIN_PEPPER`. Sin ella usa una de desarrollo y avisa. | Al arrancar el servidor y la semilla. |
| `server/src/application/user-admin-service.js` | Alta: pide una sal, calcula el hash y guarda sal y hash. | `POST /api/private/admin/users` |
| `server/src/application/auth-service.js` | Login: recalcula el hash y lo compara. Si el email no existe, hace el mismo trabajo con una sal ficticia. | `POST /api/public/login` |
| `client/src/api/auth.js` y `client/src/api/session.js` | Login desde el navegador: deriva las claves, envía `K_L`, guarda el token y `K_D` solo en memoria. | Formulario de login y cierre de sesión. |
| `client/src/components/UserAdminPanel.jsx` | Alta desde el panel: comprueba la contraseña, deriva `K_L`, genera las claves y envía todo sin la contraseña. | Formulario «Dar de alta un usuario». |
| `server/seeds/01_usuarios_demo.cjs` | Crea los dos usuarios de prueba con el mismo código que el navegador. | `npm run db:seed --workspace=server` |

Todo lo que hay dentro de `client/src/security/` y
`server/src/infrastructure/security/` es **capa de seguridad**: el equipo
puede sustituir la implementación sin tocar el resto, porque el resto solo usa
esas funciones.

## Qué pasa en cada operación

### Alta de un usuario (paso 7 + paso 8)

En el navegador, al pulsar «Dar de alta»:

1. Comprueba que la contraseña tiene entre 8 y 128 caracteres y que las dos
   copias coinciden. Si no, no envía nada.
2. `derivarClaves(pw)` → `K_L` y `K_D`.
3. `generarClavesUsuario(pw)`: genera un par RSA-OAEP de 2048 bits
   `(K_U, k_U)`, un vector de inicialización `VI` aleatorio de 16 bytes, y
   cifra la clave privada `k_U` con AES-128-CBC usando `K_D` como clave. El
   resultado es `c_kU`.
4. Envía `{ name, email, isAdmin, loginKey: base64(K_L), publicKey: K_U, privateKeyIv: VI, encryptedPrivateKey: c_kU }`.
5. Borra `K_L`, `K_D` y las contraseñas de la memoria.

En el servidor:

6. Comprueba cada campo (`loginKey` de exactamente 16 bytes, clave pública RSA
   de al menos 2048 bits, `VI` de 16 bytes, `c_kU` en bloques de 16). Si llega
   un campo `password`, responde `400`.
7. `newSalt()` → 16 bytes aleatorios.
8. `hash(K_L, sal)` → `h_L = scrypt(K_L ‖ pimienta, sal)`, 32 bytes.
9. Guarda en `USER`: `loginKeySalt`, `loginKeyHash`, `publicKey`,
   `privateKeyIv`, `encryptedPrivateKey`. Descarta `K_L`.

### Inicio de sesión (paso 8)

En el navegador:

1. `derivarClaves(pw)` → `K_L` y `K_D`.
2. Envía `{ email, loginKey: base64(K_L) }`. La contraseña no viaja.

En el servidor:

3. Busca el usuario por email.
4. Si existe: `verify(K_L, loginKeySalt, loginKeyHash)`. Recalcula el scrypt y
   compara los 32 bytes con `timingSafeEqual` (tarda lo mismo acierte o no).
5. Si no existe o no tiene hash: `verify(K_L, fakeSalt(email), HASH_FICTICIO)`.
   Hace el mismo trabajo para tardar lo mismo, y responde el mismo `401`.
6. Si la clave es correcta, emite el token de sesión.

De vuelta en el navegador:

7. Con `200`, guarda el token y `K_D` en memoria (`session.js`). Con cualquier
   error, borra `K_D`. Cerrar sesión o recibir un `401` borra las dos cosas.

Hoy `K_D` se guarda pero todavía no se usa en el login: el siguiente paso es
que el servidor devuelva `c_kU` y `VI` y el navegador abra `k_U` con `K_D`
para cifrar las tarjetas.

## Ejemplo con valores reales

Contraseña del empleado de prueba: `demo1234`. Los valores de `h`, `K_L` y
`K_D` son siempre los mismos para esa contraseña; la sal, el hash, el `VI` y
las claves RSA cambian en cada alta porque son aleatorios.

**1. Resumen y mitades** (`derivarClaves`). Provisional: SHA-256 hasta que el
equipo entregue SHA3-256.

```
h   = SHA-256("demo1234")
    = 0ead2060b65992dca4769af601a1b3a3 5ef38cfad2c2c465bb160ea764157c5d
K_L = 0ead2060b65992dca4769af601a1b3a3   (16 primeros bytes)  → base64: Dq0gYLZZktykdpr2AaGzow==
K_D = 5ef38cfad2c2c465bb160ea764157c5d   (16 últimos bytes)   → nunca sale del navegador
```

Lo que viaja en el login es exactamente esto:

```json
{ "email": "empleado@empresa.com", "loginKey": "Dq0gYLZZktykdpr2AaGzow==" }
```

**2. Sal y hash en el servidor** (`login-key-service.js`), con la pimienta de
desarrollo `pimienta-de-desarrollo-no-usar-en-produccion`:

```
sal  = newSalt()           → Z8iiBFOGg1L437o57w3hCg==   (16 bytes aleatorios)
h_L  = hash(K_L, sal)      → Mzi/H0lVmjGGhea4R16KyDdiDg3YDoEU5p66BXuLgps=   (32 bytes)
       = scrypt(K_L ‖ "pimienta-de-desarrollo-no-usar-en-produccion", sal), N=2^15, r=8, p=1
```

En la tabla `USER` quedan `loginKeySalt` y `loginKeyHash`. No queda ni la
contraseña ni `K_L`.

**3. Comprobación en el login** (`verify`):

```
verify(K_L de "demo1234", sal, h_L)  → true
verify(K_L de "demo1235", sal, h_L)  → false   (mismo tiempo de cálculo)
fakeSalt("nadie@empresa.com")        → 6sAGTCCvUjtt8kwV3rxagw==   (siempre la misma para ese email)
```

**4. Claves del usuario** (`generarClavesUsuario`), en el alta:

```
publicKey           = K_U, RSA-OAEP 2048 bits en SPKI, 392 caracteres base64 ("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC…")
privateKeyIv        = VI, 16 bytes aleatorios               → quRWymttPX9hxc2c2+31Hw==
encryptedPrivateKey = c_kU = AES-128-CBC(K_D, VI, k_U)       → 1232 bytes (múltiplo de 16)

abrirClavePrivada("demo1234", { encryptedPrivateKey, privateKeyIv }) → clave privada RSA
abrirClavePrivada("otra",     { encryptedPrivateKey, privateKeyIv }) → ClavePrivadaError
```

El servidor guarda las tres columnas, pero para abrir `c_kU` hace falta `K_D`,
y `K_D` solo se obtiene de la contraseña, que el servidor nunca ve.

### Reprodúcelo tú

Las dos mitades y la clave de login que envía el navegador:

```bash
node scripts/derivar-clave-login.mjs demo1234
# Dq0gYLZZktykdpr2AaGzow==
```

El cuerpo completo de un alta, con las claves RSA generadas:

```bash
node scripts/generar-claves-usuario.mjs demo1234 'Ana Pérez' ana@empresa.com
```

Sal, hash y verificación con el servicio del servidor (desde `server/`):

```bash
cd server && node --input-type=module -e '
import { derivarClaves } from "../client/src/security/claves-usuario.js";
import { createLoginKeyService } from "./src/infrastructure/security/login-key-service.js";
import { DEVELOPMENT_LOGIN_PEPPER } from "./src/config.js";

const servicio = createLoginKeyService({ pepper: DEVELOPMENT_LOGIN_PEPPER });
const { K_L } = await derivarClaves("demo1234");
const sal = servicio.newSalt();
const hash = await servicio.hash(K_L, sal);
console.log({ sal, hash });
console.log("correcta:", await servicio.verify(K_L, sal, hash));
console.log("otra:    ", await servicio.verify((await derivarClaves("demo1235")).K_L, sal, hash));
'
```

Lo que hay realmente guardado para los usuarios de la semilla:

```bash
cd server && node -e '
const db = require("better-sqlite3")("data/app.sqlite", { readonly: true });
console.table(db.prepare("select email, loginKeySalt, loginKeyHash, privateKeyIv from USER").all());
'
```

## Qué es provisional y qué falta

| Pieza | Estado | Quién |
|---|---|---|
| `H` = SHA-256 | Provisional. El diseño dice SHA3-256. | Equipo |
| `KDF` = scrypt con `N=2^15, r=8, p=1` | Provisional. El equipo elige la definitiva y mide los parámetros. | Equipo |
| Pimienta | Sin `LOGIN_PEPPER` se usa una pública de desarrollo, con aviso. En producción es obligatoria (16 caracteres o más). | Quien despliegue |
| Uso de `K_D` en el login | Pendiente: abrir `k_U` con `K_D` y cifrar las tarjetas con `K_U`. | Siguiente paso |
| Firma del token de sesión | Provisional HS256; falta la firma asimétrica del servidor. | Equipo |
| Datos de las tarjetas | Siguen en claro. | Siguiente paso |

Las pruebas de contrato (`client/src/security/claves-usuario.test.js` y
`server/test/login-key-service.contract.js`) definen lo que cualquier
implementación, provisional o definitiva, tiene que cumplir. Si el equipo
cambia la implementación y esas pruebas siguen pasando, el resto del sistema
no se entera.
