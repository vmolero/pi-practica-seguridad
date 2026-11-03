# Diseño: par de claves del usuario en el alta

## Context

- **Situación actual del alta.** `POST /api/private/admin/users` recibe
  `{ name, email, password, isAdmin }` y guarda la contraseña en claro
  (`user-admin-service.js`, `user-repository.js`). El formulario de
  `UserAdminPanel.jsx` tiene un único campo «Contraseña inicial».
- **Tabla `USER`.** Tiene `id, name, email, password, isAdmin`, creada por las
  migraciones `20260929154731` y `20261013100000`.
- **El diseño de referencia** es `docs/diagrama-secuencia-alta-usuario.md`, el
  mismo que se presentó en la memoria de la fase 1. El equipo ha elegido ese
  esquema, y no el de `fase-1-registro-y-cifrado`, para este primer bloque.
- **Reparto.** El equipo implementa la capa de seguridad (derivación de
  claves, generación del par, cifrado de la privada). Claude programa contra su
  interfaz, con una implementación provisional marcada mientras tanto.
- **Restricción de plataforma.** El código tiene que funcionar en Windows y en
  Linux, en el navegador y en Node 20 o posterior (lo usa la semilla). Ambos
  tienen Web Crypto en `globalThis.crypto.subtle`.

## Goals / Non-Goals

**Goals:**
- Dejar en `USER` el par de claves de cada usuario nuevo: `K_U` en claro y
  `k_U` cifrada con `K_D`.
- Que el par se genere en el navegador y que ni `K_D` ni `k_U` viajen al
  servidor.
- Fijar una interfaz estable del módulo de claves para que el login y el
  cifrado de tarjetas la reutilicen.

**Non-Goals:**
- Sustituir la contraseña por `K_L`/`h_L` y añadir sal y pimienta en el
  servidor (cambio siguiente).
- Entregar `c_kU` y `VI` al cliente en el login.
- Cifrar las tarjetas.
- Migrar las claves de usuarios antiguos, cambiar la contraseña o rotar claves.

## Decisions

### Notación

Se usa la de `docs/diagrama-secuencia-alta-usuario.md` y la de los temas 1–4.

| Símbolo | Significado |
|---|---|
| `pw` | Contraseña inicial que se escribe en el panel. |
| `H(x)` | SHA3-256 sobre los bytes UTF-8 de `x`. |
| `h = H(pw)` | Resumen de 256 bits. |
| `K_L = h[0..127]` | Clave de login. Se calcula pero **no se usa en este cambio**. |
| `K_D = h[128..255]` | Clave de datos (AES-128). |
| `K_U = (n, e)`, `k_U = d` | Par RSA del usuario (`n` de 2048 bits, `e = 65537`). |
| `VI` | 16 bytes aleatorios. |
| `c_kU = E_K_D(k_U)` | AES-128-CBC de `k_U` (PKCS#8) con `VI`, relleno PKCS#7. |

### D1. Esquema del diagrama: SHA3-256 partido, RSA-OAEP 2048 y AES-128-CBC

Es lo que ya figura en la memoria y en los diagramas, y lo ha elegido el
equipo. Se descartó el esquema de `fase-1` (PBKDF2 + HKDF + AES-256-GCM +
RSA 3072): es más robusto, pero obligaría a rehacer los diagramas. Sus
debilidades se recogen en «Risks» y en la memoria como trabajo futuro.

### D2. Primitivas: Web Crypto para RSA y AES; SHA3-256 aparte

- `crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: 65537, hash: 'SHA-256' }, true, [...])`.
- `exportKey('spki')` y `exportKey('pkcs8')`.
- `importKey('raw', K_D, 'AES-CBC')` y `encrypt({ name: 'AES-CBC', iv: VI }, …)`.
- `crypto.getRandomValues` para el `VI`.

Web Crypto no tiene SHA3. Propuesta: `sha3_256` de `@noble/hashes`. Es JS puro,
auditada y sin dependencias, y funciona igual en el navegador y en Node. La
alternativa es que el equipo implemente Keccak-f[1600] a mano: es posible,
pero tiene más riesgo de error y no aporta a la práctica. La decisión final es
del equipo (ver Open Questions).

### D3. Interfaz del módulo `client/src/security/claves-usuario.js`

```js
// h = SHA3-256(pw); devuelve { K_L, K_D } como Uint8Array de 16 bytes.
derivarClaves(pw)

// Genera (K_U, k_U), cifra k_U con K_D y devuelve, en base64:
// { publicKey, encryptedPrivateKey, privateKeyIv }
generarClavesUsuario(pw)

// Inversa: devuelve la CryptoKey k_U (RSA-OAEP, uso 'decrypt').
// Lanza un error si pw no es la correcta (relleno o PKCS#8 inválidos).
abrirClavePrivada(pw, { encryptedPrivateKey, privateKeyIv })
```

Solo usa `globalThis.crypto` y la función SHA3, sin APIs del DOM, así que lo
puede importar también la semilla.

Hasta que el equipo entregue su versión, Claude deja una implementación
**PROVISIONAL**, marcada en cabecera y comentarios:
- es idéntica salvo que `H` es SHA-256 de Web Crypto, para no añadir la
  dependencia antes de que el equipo decida;
- las pruebas de contrato (ida y vuelta, contraseña incorrecta, `VI`
  distintos) se escriben contra la interfaz y deben pasar con las dos
  versiones.

### D4. Codificación y columnas

- `publicKey`: SPKI DER en base64 (unos 392 caracteres para RSA 2048).
- `encryptedPrivateKey`: PKCS#8 cifrado en base64 (unos 1,6 kB).
- `privateKeyIv`: 16 bytes en base64 (24 caracteres).

Las columnas son `text` y admiten `NULL`, de modo que la migración no rompe
las bases existentes. Se nombran en camelCase inglés, como las demás
(`isAdmin`, `expiryMonth`). Se usa base64 estándar, no JWK, porque es más
compacto y lo valida directamente `node:crypto`.

### D5. Validación en el servidor

`user-request.js` añade los tres campos a `CREATE_FIELDS`:
- `publicKey`: `crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })`,
  y se exige `asymmetricKeyType === 'rsa'` y
  `asymmetricKeyDetails.modulusLength >= 2048`.
- `privateKeyIv`: exactamente 16 bytes decodificados.
- `encryptedPrivateKey`: entre 16 y 4096 bytes, en un número múltiplo de 16
  (el tamaño de bloque de AES).

El servidor no puede comprobar que `c_kU` esté bien cifrado, porque no tiene
`K_D`, y no lo intenta.

Las respuestas siguen pasando por `toAdminUser`/`toPublicUser`. `ADMIN_COLUMNS`
no cambia y el `returning` del alta tampoco incluye las claves.

### D6. Formulario del panel

- Se añade el campo «Repite la contraseña», que solo se valida en el cliente
  y no se envía.
- Al enviar:
  1. se comprueba que coinciden;
  2. `await generarClavesUsuario(pw)`;
  3. `createUser({ name, email, password, isAdmin, ...claves })`.
- Mientras tanto el botón muestra «Generando claves…». Generar un par RSA 2048
  tarda entre décimas de segundo y un par de segundos.
- Si hay un error, se vacían las dos contraseñas y se conservan el resto de
  campos.

### D7. Semilla

`01_usuarios_demo.cjs` hace
`await import('../../client/src/security/claves-usuario.js')` y llama a
`generarClavesUsuario('demo1234')` y a `generarClavesUsuario('admin1234')`.
Hay una sola implementación, la que usa el navegador, así que no puede
divergir.

Se descartó duplicar el código en `server/`, porque obligaría a mantener dos
copias de la capa de seguridad. Con npm workspaces, `@noble/hashes` se instala
en el `node_modules` raíz, que es accesible desde los dos lados.

## Risks / Trade-offs

- **[La contraseña sigue llegando en claro al servidor]** Mientras sea así,
  el servidor puede calcular `K_D` y abrir `c_kU`: no hay conocimiento cero.
  → Se documenta como provisional en la memoria y en el código. Lo cierra el
  cambio de login con `K_L`.
- **[SHA3 sin sal ni iteraciones]** Si se filtra la base de datos, `c_kU` se
  puede atacar por fuerza bruta probando contraseñas, y dos usuarios con la
  misma `pw` tienen la misma `K_D`. → Viene así del diagrama. En la memoria se
  propone como mejora usar `H(pw ‖ email)` o un KDF lento (PBKDF2/Argon2).
- **[CBC no autentica]** Si alguien modifica `c_kU`, no se detecta salvo
  porque el relleno o el PKCS#8 dejen de ser válidos. → Mejora futura: AES-GCM
  o añadir un MAC. Queda anotado en la memoria.
- **[Implementación provisional distinta de la final]** Las claves generadas
  con SHA-256 no se abrirán con la versión SHA3. → La única base con esas
  claves es la de desarrollo: basta con `db:seed` tras sustituir el módulo.
  Se indica en la tarea del equipo.
- **[La semilla importa código del cliente]** Si el módulo usara APIs del
  navegador, la semilla dejaría de funcionar. → El módulo solo usa
  `globalThis.crypto`, y hay una prueba en Node que lo importa.
- **[Usuarios antiguos con `NULL`]** No podrán cifrar tarjetas cuando llegue
  ese paso. → En desarrollo se vuelve a sembrar. Si hiciera falta, una
  regeneración en el primer login queda para el cambio de login.

## Migration Plan

1. `npm run db:migrate --workspace=server`: añade las columnas.
2. `npm run db:seed --workspace=server`: vuelve a crear a los usuarios de
   demostración con sus claves.
3. Rollback: `npx knex --knexfile knexfile.cjs migrate:rollback` en `server/`
   elimina las tres columnas. SQLite ≥ 3.35, incluido en better-sqlite3 12,
   admite `DROP COLUMN`.

## Open Questions

- **Librería SHA3.** ¿`@noble/hashes` o una implementación propia del
  equipo? Mientras no se decida, el módulo provisional usa SHA-256.
- **¿Se calcula `K_L` ya?** `derivarClaves` lo devuelve, pero este cambio no
  lo envía. Se deja así para que el cambio de login no tenga que tocar la
  derivación.
