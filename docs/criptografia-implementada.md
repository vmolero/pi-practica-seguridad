# La criptografía que ya está en el código

Esta página explica, sin entrar en teoría, qué código criptográfico tiene la
aplicación hoy (pasos 7 a 10), dónde está y qué pasa cuando alguien se da de
alta, inicia sesión o guarda una tarjeta. Al final hay un ejemplo con valores reales que puedes
reproducir en tu máquina.

Si quieres la justificación de cada decisión, está en
[implementación y seguridad](primera-memoria/implementacion-y-seguridad.md),
secciones «Claves del usuario (paso 7)», «Clave de login con sal y pimienta
(paso 8)», «Apertura de la clave privada en el login (paso 9)» y «Tarjetas
cifradas de extremo a extremo (paso 10)». Los símbolos (`K_L`, `K_D`, `c_kU`,
`K_t`, `w_U`…) son los del
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
4. Cada tarjeta se cifra en el navegador con una clave aleatoria `K_t`
   (AES-256-GCM, un cifrado por valor) y `K_t` viaja y se guarda envuelta con
   la clave pública del usuario. Solo la clave privada, abierta en el login,
   la recupera: el servidor nunca ve una tarjeta.

```
contraseña ──H──▶ h (32 bytes) ──┬── h[0..15]  = K_L ──▶ viaja al servidor ──▶ h_L = scrypt(K_L ‖ pimienta, sal)
                                 └── h[16..31] = K_D ──▶ se queda en el navegador ──▶ c_kU = AES-CBC(K_D, k_U)

tarjeta: K_t ←aleatoria──▶ c_x = AES-GCM(K_t, VI_x, m_x, AAD = "id:campo")  y  w_U = RSA-OAEP(K_U, K_t)  ──▶ al servidor
         k_U (del login) ──▶ K_t = RSA-OAEP⁻¹(k_U, w_U) ──▶ m_x = AES-GCM⁻¹(K_t, VI_x, c_x)                    ◀── del servidor
```

## Dónde está el código

| Fichero | Qué hace | Cuándo se ejecuta |
|---|---|---|
| `client/src/security/claves-usuario.js` | `derivarClaves(pw)` → `{ K_L, K_D }`. `generarClavesUsuario(pw)` → par RSA y clave privada cifrada. `abrirClavePrivadaConKD(K_D, …)` hace la inversa (y `abrirClavePrivada(pw, …)` a partir de la contraseña). `comprobarParDeClaves(K_U, k_U)` verifica que la privada corresponde a la pública. | En el navegador, en el alta y en el login. También en Node (semilla y scripts). |
| `server/src/infrastructure/security/login-key-service.js` | `newSalt()`, `hash(K_L, sal)`, `verify(K_L, sal, hash)`, `fakeSalt(email)`. | En el servidor, en el alta y en el login. |
| `server/src/config.js` | Lee la pimienta de `LOGIN_PEPPER`. Sin ella usa una de desarrollo y avisa. | Al arrancar el servidor y la semilla. |
| `server/src/application/user-admin-service.js` | Alta: pide una sal, calcula el hash y guarda sal y hash. | `POST /api/private/admin/users` |
| `server/src/application/auth-service.js` | Login: recalcula el hash y lo compara. Si el email no existe, hace el mismo trabajo con una sal ficticia. | `POST /api/public/login` |
| `server/src/domain/user.js` | `toUserKeys(user)`: los tres valores de clave que se devuelven al propio usuario en el login, o `null`. | `POST /api/public/login` |
| `client/src/security/tarjetas-cifradas.js` | `cifrarTarjeta(K_U, { id, number, expiry, cvv })` → `id`, tres `{ iv, ciphertext }` y `wrappedKey`. `descifrarTarjeta(k_U, tarjeta)` hace la inversa. `abrirClaveTarjeta(k_U, wrappedKey)` y `cifrarValores(K_t, id, valores)` para editar. | En el navegador, al guardar, listar y editar tarjetas. También en Node (semilla, tests y script). |
| `client/src/api/cards.js` | Genera el `id`, cifra antes de enviar, descifra lo que llega y se queda solo con el resumen (`last4`, caducidad) o marca la tarjeta como dañada. | Panel «Mis tarjetas». |
| `server/src/infrastructure/http/card-request.js` | Solo estructura: UUID, 12 bytes de `iv`, 35/23/20 bytes de `ciphertext`, 256 de `wrappedKey`. No puede validar el contenido. | `POST` y `PATCH /api/private/cards` |
| `client/src/api/auth.js` y `client/src/api/session.js` | Login desde el navegador: deriva las claves, envía `K_L`, abre `k_U` con `K_D`, comprueba el par y guarda el token, `K_U` y `k_U` solo en memoria. | Formulario de login y cierre de sesión. |
| `client/src/components/UserAdminPanel.jsx` | Alta desde el panel: comprueba la contraseña, deriva `K_L`, genera las claves y envía todo sin la contraseña. | Formulario «Dar de alta un usuario». |
| `server/seeds/01_usuarios_demo.cjs` | Crea los dos usuarios de prueba y la tarjeta cifrada del empleado con el mismo código que el navegador. | `npm run db:seed --workspace=server` |
| `scripts/cifrar-tarjeta.mjs` | Cifra una tarjeta como el navegador (cuerpo listo para `curl`) o, con `--abrir`, descifra una con la contraseña del usuario. | A mano, para probar la API y reproducir el ejemplo. |

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

### Inicio de sesión (pasos 8 y 9)

En el navegador:

1. `derivarClaves(pw)` → `K_L` y `K_D`.
2. Envía `{ email, loginKey: base64(K_L) }`. La contraseña no viaja.

En el servidor:

3. Busca el usuario por email.
4. Si existe: `verify(K_L, loginKeySalt, loginKeyHash)`. Recalcula el scrypt y
   compara los 32 bytes con `timingSafeEqual` (tarda lo mismo acierte o no).
5. Si no existe o no tiene hash: `verify(K_L, fakeSalt(email), HASH_FICTICIO)`.
   Hace el mismo trabajo para tardar lo mismo, y responde el mismo `401`.
6. Si la clave es correcta, emite el token de sesión y devuelve también las
   claves guardadas del usuario: `keys = { publicKey, privateKeyIv, encryptedPrivateKey }`.
   Es el único sitio donde salen del servidor.

De vuelta en el navegador:

7. `abrirClavePrivadaConKD(K_D, keys)`: descifra `c_kU` con AES-128-CBC y
   `K_D` e importa el resultado como clave privada RSA **no exportable**.
8. `comprobarParDeClaves(K_U, k_U)`: cifra 32 bytes aleatorios con la pública
   y los descifra con la privada. Si no vuelve lo mismo, las claves no se
   corresponden.
9. Si todo va bien, guarda el token, `K_U` y `k_U` en memoria (`session.js`).
   Si algo falla, descarta el token y muestra «No se ha podido abrir tu clave
   privada. Vuelve a intentarlo.». En los dos casos borra `K_D`. Cerrar
   sesión o recibir un `401` suelta el token y las claves.

Con `k_U` abierta en el navegador ya se pueden cifrar las tarjetas.

### Guardar y leer una tarjeta (paso 10)

Al guardar (`createCard` en `cards.js` → `cifrarTarjeta`):

1. El panel valida el contenido (Luhn, caducidad, CVV). Es la única
   validación de contenido que hay: el servidor no verá los datos.
2. `id` ← `crypto.randomUUID()`.
3. `K_t` ← 32 bytes aleatorios, importados como clave AES-GCM no exportable;
   los bytes en crudo se ponen a cero.
4. Cada valor se lleva a tamaño fijo (número a 19 caracteres y CVV a 4,
   rellenando con espacios por la izquierda; caducidad `MM/AAAA`) y se cifra
   por separado: `VI_x` ← 12 bytes aleatorios,
   `c_x = AES-256-GCM(K_t, VI_x, m_x)` con datos asociados `"<id>:<campo>"`.
   Los cifrados miden siempre 35, 23 y 20 bytes (texto + etiqueta de 16).
5. `w_U = RSA-OAEP(K_U, K_t)`: 256 bytes.
6. `POST /api/private/cards` con `{ id, number: { iv, ciphertext }, expiry,
   cvv, wrappedKey }`, todo en base64. El servidor comprueba solo la forma y
   los tamaños, guarda los cifrados en `CARD` y `wrappedKey` en `USER_CARD`
   (en una transacción), y responde `201` con lo guardado o `409` si el `id`
   ya existe.

Al listar (`listCards` → `descifrarTarjeta`), para cada tarjeta que llega:

7. `K_t = RSA-OAEP⁻¹(k_U, w_U)`, importada como clave AES-GCM no exportable.
8. `m_x = AES-256-GCM⁻¹(K_t, VI_x, c_x)` con el mismo `AAD_x`; se quita el
   relleno. Cualquier byte cambiado en `c_x`, en `VI_x` o en `w_U`, o un
   valor copiado de otra tarjeta o de otro campo, hace fallar la etiqueta o el
   relleno OAEP y el panel muestra «Tarjeta dañada: no se ha podido
   descifrar.».
9. `cards.js` se queda con los 4 últimos dígitos y la caducidad y descarta
   el resto. Nada se escribe en la consola ni en el almacenamiento.

Al editar, el navegador abre `K_t` con `k_U` (`abrirClaveTarjeta`), cifra
solo los valores cambiados con vectores nuevos (`cifrarValores`) y los envía
con `PATCH`; `w_U` no cambia.

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

**5. Apertura en el login** (paso 9), con la `K_D` de `demo1234` y las claves
que devuelve `POST /api/public/login`:

```
k_U = abrirClavePrivadaConKD(K_D, { encryptedPrivateKey, privateKeyIv })  → CryptoKey privada, extractable = false
K_U = importarClavePublica(publicKey)                                     → CryptoKey pública
comprobarParDeClaves(K_U, k_U)                                            → true
comprobarParDeClaves(K_U, privada de otro usuario)                        → false
abrirClavePrivadaConKD(K_D equivocada, …)                                 → ClavePrivadaError
```

Tras esto el navegador borra `K_D`; solo quedan el token, `K_U` y `k_U`.

**6. Una tarjeta cifrada** (paso 10). Lo que hay guardado para la tarjeta de
la semilla del empleado (`4111 1111 1111 1111`, `12/2030`, `123`), tal como
lo devuelve `GET /api/private/cards`. Los valores cambian en cada siembra
porque `K_t` y los `VI` son aleatorios y `w_U` depende del par de claves:

```json
{
  "id": "bddcaeb4-3ddf-42a4-b7d1-1e042f5bba3c",
  "number": { "iv": "LLFiTRr8xiwu+AUl", "ciphertext": "NMTnYC5ZKN+o/ieQc0nT2bkjoGexO6lHi+UWoMV1YEZc5hQ=" },
  "expiry": { "iv": "sG4pzVSzGtImiEUc", "ciphertext": "A8XWI+cSUUvdBIsh7HWLgN4SvNQWi1c=" },
  "cvv":    { "iv": "U/UyoOGdbM1xUfqS", "ciphertext": "6yYHVPVehh/3d7SkGbSNbdK/lGI=" },
  "wrappedKey": "yDa6YOklEl4IKOdvjR/auqkDp28T65mXC4HrUgi+bf0UJxlKLKR3ZDE3b3q6OBiX…(256 bytes, 344 caracteres)",
  "createdAt": "2026-11-10T16:57:03.838Z"
}
```

```
id                 = UUID v4 generado por quien cifra (aquí, la semilla); va en los datos asociados
number.iv          = VI_num, 12 bytes aleatorios
number.ciphertext  = c_num = AES-256-GCM(K_t, VI_num, "   4111111111111111", AAD = id + ":number")   → 35 bytes (19 + etiqueta de 16)
expiry.ciphertext  = c_cad = AES-256-GCM(K_t, VI_cad, "12/2030",             AAD = id + ":expiry")   → 23 bytes (7 + 16)
cvv.ciphertext     = c_cvv = AES-256-GCM(K_t, VI_cvv, " 123",                AAD = id + ":cvv")      → 20 bytes (4 + 16)
wrappedKey         = w_U = RSA-OAEP(K_U del empleado, K_t)                                           → 256 bytes

descifrarTarjeta(k_U del empleado, tarjeta)      → { number: "4111111111111111", expiry: "12/2030", cvv: "123" }
descifrarTarjeta(k_U del administrador, tarjeta) → TarjetaCifradaError   (w_U no se abre con otra clave privada)
descifrarTarjeta(k_U, tarjeta con un bit cambiado en number.ciphertext) → TarjetaCifradaError   (la etiqueta GCM no cuadra)
```

En `CARD` están `id` y los seis valores (`numberIv`, `numberCiphertext`…); en
`USER_CARD`, `wrappedKey` en la fila del propietario. No hay ninguna columna
con un dígito en claro.

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

Apertura de la clave privada con `K_D` y comprobación del par, como hace el
navegador en el login (desde `server/`, con los usuarios de la semilla):

```bash
cd server && node --input-type=module -e '
import { derivarClaves, abrirClavePrivadaConKD, importarClavePublica, comprobarParDeClaves } from "../client/src/security/claves-usuario.js";
import { createRequire } from "node:module";
const db = createRequire(import.meta.url)("better-sqlite3")("data/app.sqlite", { readonly: true });
const fila = db.prepare("select publicKey, privateKeyIv, encryptedPrivateKey from USER where email = ?").get("empleado@empresa.com");

const { K_D } = await derivarClaves("demo1234");
const k_U = await abrirClavePrivadaConKD(K_D, fila);
const K_U = await importarClavePublica(fila.publicKey);
console.log("exportable:", k_U.extractable, "| par correcto:", await comprobarParDeClaves(K_U, k_U));
try { await abrirClavePrivadaConKD(new Uint8Array(16), fila); } catch (e) { console.log("K_D equivocada:", e.name); }
'
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

Una tarjeta cifrada como la cifra el navegador, lista para `POST
/api/private/cards`, y su apertura con la contraseña del empleado (desde la
raíz del proyecto, con la base de datos sembrada):

```bash
node scripts/cifrar-tarjeta.mjs empleado@empresa.com demo1234 '5555 5555 5555 4444' 11/2029 456 > /tmp/tarjeta.json
cat /tmp/tarjeta.json
# {"id":"9c7f352d-…","number":{"iv":"DHOIxyPETPVvVQhY","ciphertext":"rS+mKxR2PfA1L5jhkQ1YnBJZ0uaYifuO5NNlXKZpetTyKNM="},…,"wrappedKey":"YK4m…"}

node scripts/cifrar-tarjeta.mjs empleado@empresa.com demo1234 --abrir < /tmp/tarjeta.json
# {"id":"9c7f352d-…","number":"5555555555554444","expiry":"11/2029","cvv":"456"}

node scripts/cifrar-tarjeta.mjs admin@empresa.com admin1234 --abrir < /tmp/tarjeta.json
# No se ha podido descifrar la tarjeta.
```

Lo mismo con la tarjeta de la semilla tal como está en la base de datos, y la
prueba de que un bit cambiado se detecta (desde `server/`):

```bash
cd server && node --input-type=module -e '
import { abrirClavePrivada } from "../client/src/security/claves-usuario.js";
import { descifrarTarjeta } from "../client/src/security/tarjetas-cifradas.js";
import { createRequire } from "node:module";
const db = createRequire(import.meta.url)("better-sqlite3")("data/app.sqlite", { readonly: true });
const usuario = db.prepare("select publicKey, privateKeyIv, encryptedPrivateKey from USER where email = ?").get("empleado@empresa.com");
const fila = db.prepare("select c.*, uc.wrappedKey from CARD c join USER_CARD uc on uc.cardId = c.id where uc.isOwner = 1").get();
const tarjeta = { id: fila.id, wrappedKey: fila.wrappedKey,
  number: { iv: fila.numberIv, ciphertext: fila.numberCiphertext },
  expiry: { iv: fila.expiryIv, ciphertext: fila.expiryCiphertext },
  cvv: { iv: fila.cvvIv, ciphertext: fila.cvvCiphertext } };

const k_U = await abrirClavePrivada("demo1234", usuario);
console.log(await descifrarTarjeta(k_U, tarjeta));
const bytes = Buffer.from(fila.numberCiphertext, "base64"); bytes[0] ^= 1;
try { await descifrarTarjeta(k_U, { ...tarjeta, number: { ...tarjeta.number, ciphertext: bytes.toString("base64") } }); }
catch (e) { console.log("un bit cambiado:", e.name); }
'
```

## Qué es provisional y qué falta

| Pieza | Estado | Quién |
|---|---|---|
| `H` = SHA-256 | Provisional. El diseño dice SHA3-256. | Equipo |
| `KDF` = scrypt con `N=2^15, r=8, p=1` | Provisional. El equipo elige la definitiva y mide los parámetros. | Equipo |
| Pimienta | Sin `LOGIN_PEPPER` se usa una pública de desarrollo, con aviso. En producción es obligatoria (16 caracteres o más). | Quien despliegue |
| Uso de `K_D` en el login | Hecho (paso 9): el navegador abre `k_U` y la conserva como `CryptoKey` no exportable. | — |
| Integridad de `c_kU` y firma de `K_U` | Pendiente: CBC no detecta cambios y un servidor malicioso podría sustituir el par (y leer las tarjetas cifradas desde entonces). | Más adelante |
| Cifrado de tarjetas con `K_U` / `k_U` | Hecho (paso 10): `K_t` AES-256 por tarjeta, GCM con datos asociados por valor, `w_U` con RSA-OAEP. | — |
| Firma del token de sesión | Provisional HS256; falta la firma asimétrica del servidor. | Equipo |
| Datos de las tarjetas | Cifrados en el navegador; el servidor solo guarda cifrados y claves envueltas. Compartir y rotar `K_t` quedan para la fase 2. | Fase 2 |

Las pruebas de contrato (`client/src/security/claves-usuario.test.js`,
`client/src/security/tarjetas-cifradas.test.js` y
`server/test/login-key-service.contract.js`) definen lo que cualquier
implementación, provisional o definitiva, tiene que cumplir. Si el equipo
cambia la implementación y esas pruebas siguen pasando, el resto del sistema
no se entera.
