# Diseño: clave de login derivada de la contraseña, con sal y pimienta

## Context

- **Situación actual.** `POST /api/public/login` recibe `{ email, password }`
  y `auth-service.js` compara con `===` contra la columna `password` de `USER`
  (texto claro). `POST /api/private/admin/users` recibe `password` y la guarda
  tal cual. La comparación está aislada en una línea marcada como provisional.
- **Cambio previo.** `claves-usuario-en-alta` deja en `USER` el par de claves
  del usuario y define el módulo `client/src/security/claves-usuario.js` con
  `derivarClaves(pw) → { K_L, K_D }` (SHA3-256 partido en dos mitades de
  16 bytes) y `generarClavesUsuario(pw)`. Su propuesta deja escrito que el
  siguiente cambio sustituye `password` por `K_L`/`h_L`. Este es ese cambio.
- **Diseño de referencia.** `docs/diagrama-secuencia-alta-usuario.md` y
  `docs/diagrama-secuencia-login.md`, basados en las notas del 13 de octubre:
  `h_L = KDF(K_L ‖ pimienta, sal)` con scrypt, bcrypt o Argon2; sal de
  128 bits por usuario en la tabla; pimienta en la configuración; comparación
  en tiempo constante; sal ficticia para emails inexistentes.
- **Reparto.** La función `KDF`, la sal, la pimienta, la comparación y la sal
  ficticia son capa de seguridad (equipo). Claude programa contra el contrato
  con una implementación provisional marcada, como en `paso-2-middleware-jwt`.
- **Restricciones.** Windows y Linux; Node 20 o posterior; la semilla de Knex
  (`.cjs`) importa el módulo del cliente con `await import()`.

## Goals / Non-Goals

**Goals:**
- Que la contraseña no salga nunca del navegador: ni en el login ni en el alta.
- Que el servidor guarde solo `loginKeySalt` y `loginKeyHash`, y que un volcado
  de la base de datos no permita iniciar sesión ni recuperar `K_L`.
- Que el servidor no pueda obtener `K_D` y por tanto no pueda abrir `c_kU`.
- Mantener intactos el token, el middleware y la sección privada.
- Dejar el `KDF` detrás de un contrato con tests, sustituible por el equipo.

**Non-Goals:**
- Devolver `c_kU` y `VI` en el login y abrir la clave privada con `K_D`.
- Cambio de contraseña, recuperación de cuenta y rotación de sal o pimienta.
- Limitación de intentos, doble factor y reto-respuesta.
- Migrar las contraseñas de usuarios existentes: no se puede, porque el
  servidor no debe calcular `K_L`. Se vuelven a crear.

## Decisions

### Notación

La de los diagramas de `docs/` y de los temas 1 a 4.

| Símbolo | Significado |
|---|---|
| `pw` | Contraseña escrita por el usuario (login) o por el gestor (alta). |
| `h = H(pw)` | SHA3-256 de los bytes UTF-8 de `pw`, 256 bits. |
| `K_L = h[0..127]` | Clave de login, 128 bits. Viaja al servidor en base64 (`loginKey`). |
| `K_D = h[128..255]` | Clave de datos, 128 bits. Nunca sale del navegador. |
| `sal` | 16 bytes aleatorios por usuario (`loginKeySalt`, base64). |
| `pimienta` | Secreto de configuración, igual para todos (`LOGIN_PEPPER`). |
| `h_L = KDF(K_L ‖ pimienta, sal)` | Hash lento guardado (`loginKeyHash`, base64). |
| `h'_L` | El mismo cálculo en el login con la `K_L` recibida. |
| `=ct` | Comparación en tiempo constante (`crypto.timingSafeEqual`). |
| `sal_falsa = HMAC-SHA-256(pimienta, email)[0..127]` | Sal ficticia para un email inexistente. |

### D1. Orden de las mitades: `K_L` primero, `K_D` después

La petición del cambio decía "primera mitad para los datos, segunda para la
contraseña"; la documentación y `derivarClaves` fijan `K_L = h[0..127]` y
`K_D = h[128..255]`. Se sigue la documentación. Criptográficamente da igual:
las dos mitades de un hash son independientes a efectos prácticos. Lo que
importa es no cambiar el orden una vez sembrado, porque invalida `c_kU` y
`h_L` de todos los usuarios. Si se decide el otro orden, se cambia en
`derivarClaves` **antes** de implementar `claves-usuario-en-alta` y este
cambio, y se anota en los dos diagramas.

### D2. `KDF` provisional: scrypt de `node:crypto`; la definitiva la elige el equipo

Las notas admiten scrypt, bcrypt o Argon2. La implementación provisional usa
`scrypt` de `node:crypto` con `N = 2^15`, `r = 8`, `p = 1` y 32 bytes de
salida, porque es nativo, está en Windows y Linux sin compilar nada y es de
los tres el único sin dependencia. Entrada: `K_L ‖ pimienta` (bytes de `K_L`
seguidos de los bytes UTF-8 de la pimienta); sal: los 16 bytes de
`loginKeySalt`. El equipo puede mantener scrypt (y ajustar los parámetros
midiendo el tiempo en los equipos de la práctica) o pasar a Argon2id
(librería `argon2`, nativa) o bcrypt (`bcryptjs`). La elección se anota en
`server/src/infrastructure/security/README.md` y en la memoria.

Alternativa descartada: guardar `SHA3(K_L ‖ sal)` sin función lenta. Un
volcado de la base de datos permitiría probar contraseñas a la velocidad de
SHA3; las notas piden expresamente una función lenta.

### D3. Contrato del servicio de clave de login

`server/src/infrastructure/security/login-key-service.js`:

```js
createLoginKeyService({ pepper }) → {
  newSalt(),                              // 16 bytes aleatorios, base64
  async hash(loginKey, salt),             // Uint8Array(16), base64 → base64
  async verify(loginKey, salt, expectedHash), // → boolean, tiempo constante
  fakeSalt(email),                        // base64 determinista por email
}
```

- `loginKey` que no sea `Uint8Array` de 16 bytes → `TypeError`.
- `verify` compara con `timingSafeEqual` sobre los bytes decodificados; si
  `expectedHash` tiene otra longitud devuelve `false` tras calcular el hash
  igualmente.
- `fakeSalt` es `HMAC-SHA-256(pimienta, email)` truncado a 16 bytes: así el
  tiempo y la "sal" de un email inexistente son estables entre peticiones y no
  se distingue de un usuario real por repetición.
- Tests de contrato en `server/test/login-key-service.contract.js`
  (`runLoginKeyServiceContractTests(createService)`), ejecutados contra la
  provisional en `login-key-service.test.js`; el equipo añade otro archivo
  para la suya.

### D4. Esquema de `USER`

Migración `server/migrations/<timestamp>_replace_password_with_login_key.cjs`:
- `dropColumn('password')`;
- `loginKeySalt` y `loginKeyHash`: `text`, admiten `NULL`.

`down`: quita las dos columnas y vuelve a añadir `password` como `text`
`notNullable().defaultTo('')`, porque las filas existentes ya no tienen
contraseña. Los usuarios anteriores quedan con `NULL` y no pueden iniciar
sesión; en desarrollo se vuelve a sembrar. Se descartó convertir las
contraseñas existentes en la migración: el servidor tendría que calcular
`H(pw)`, que es justo lo que este cambio le prohíbe.

`user-repository.findByEmail` devuelve `loginKeySalt` y `loginKeyHash` en
lugar de `password`; `ADMIN_COLUMNS`, `list` y `findById` no cambian.
`create` recibe `{ name, email, isAdmin, loginKeySalt, loginKeyHash,
publicKey, encryptedPrivateKey, privateKeyIv }`.

### D5. Formato en la API: `loginKey` en base64 estándar

16 bytes → 24 caracteres con `==`. Misma codificación que `privateKeyIv`. La
validación (`login-request.js` y `user-request.js`) decodifica con
`Buffer.from(value, 'base64')`, exige exactamente 16 bytes y que la
recodificación coincida con la entrada (rechaza relleno o caracteres
inválidos que `Buffer` ignora). Las reglas de `password` desaparecen de ambos;
`password` presente → `400` porque `hasOnlyFields` ya rechaza campos extra en
el alta, y `parseLoginRequest` pasa a rechazar campos distintos de `email` y
`loginKey`.

### D6. Flujo del login en el servidor

`createAuthService({ userRepository, loginKeyService, tokenService })`:

1. `user ← findByEmail(email)`.
2. Si no hay usuario o `loginKeyHash` es `NULL`:
   `await verify(K_L, fakeSalt(email), HASH_FICTICIO)` y lanzar
   `InvalidCredentialsError`. `HASH_FICTICIO` es un hash constante de la
   longitud correcta calculado al crear el servicio, para que la comparación
   recorra la misma ruta.
3. Si hay usuario: `ok ← await verify(K_L, loginKeySalt, loginKeyHash)`;
   si no, `InvalidCredentialsError`.
4. Emitir el token como hasta ahora.

`K_L` solo existe como argumento; no se copia a ningún objeto ni se registra.
El router público no cambia salvo el parser.

### D7. Pimienta: `LOGIN_PEPPER` con pimienta de desarrollo

`loadConfig` añade `loginPepper`:
- definida y de 16 caracteres o más → se usa;
- definida y más corta → `Error` ("LOGIN_PEPPER debe tener al menos 16
  caracteres");
- ausente → `'pimienta-de-desarrollo-no-usar-en-produccion'` y aviso en
  consola.

Se descartó generar una pimienta aleatoria por proceso, como hace
`JWT_SECRET`: invalidaría todos los `loginKeyHash` en cada reinicio, incluidos
los de la semilla. Una pimienta fija de desarrollo es honesta: en desarrollo
no aporta secreto, y así se documenta. La semilla lee `LOGIN_PEPPER` con la
misma función, de modo que semilla y servidor coinciden mientras se arranquen
con el mismo entorno.

### D8. Cliente

- `client/src/api/session.js` guarda también `K_D` (`setDataKey`,
  `getDataKey`, `clearSession` borra token y `K_D`). Solo en memoria.
- `client/src/api/auth.js`: `login({ email, password })` hace
  `const { K_L, K_D } = await derivarClaves(password)`, envía
  `{ email, loginKey: base64(K_L) }`, y solo con `200` guarda token y `K_D`.
  `logout()` llama a `clearSession()`.
- `client/src/api/http.js`: ante `401` llama a `clearSession()` en lugar de
  `clearToken()`.
- `LoginForm.jsx` no cambia su interfaz: sigue pasando `password` a `login()`
  y vaciando el campo. El mensaje `Email o contraseña incorrectos.` se
  mantiene.
- `UserAdminPanel.jsx` (sobre la versión de `claves-usuario-en-alta`): tras
  comprobar que las contraseñas coinciden y miden entre 8 y 128 caracteres,
  `derivarClaves(pw)` y `generarClavesUsuario(pw)`; `createUser` envía
  `loginKey` y no `password`. El atributo `minLength` ya existe; se añade la
  comprobación explícita con el mensaje
  `La contraseña debe tener entre 8 y 128 caracteres`.
- `K_D` se conserva para el cambio siguiente (abrir `c_kU`); en este cambio
  nadie la lee. Se guarda ya para que ese cambio no toque el login.

### D9. Semilla y script de ayuda

`01_usuarios_demo.cjs`: `const { derivarClaves } = await import(
'../../client/src/security/claves-usuario.js')`, `const { createLoginKeyService }
= await import('../src/infrastructure/security/login-key-service.js')`, y la
pimienta con `loadConfig(process.env).loginPepper`. Para cada usuario:
`salt = newSalt()`, `hash = await hash(K_L, salt)`.

`scripts/derivar-clave-login.mjs <contraseña>` importa `derivarClaves` e
imprime `base64(K_L)`. Sirve para los ejemplos de `curl` del README y para
que el equipo compruebe su implementación de SHA3 contra la del navegador.

### D10. Tests

- Contrato del servicio (D3) y test de `fakeSalt`.
- `config.test.js`: tres casos de `LOGIN_PEPPER`.
- `login-request.test.js` y `user-request.test.js`: casos de `loginKey` y
  rechazo de `password`.
- `auth-service.test.js`: `loginKeyService` falso; comprueba que se llama a
  `verify` con la sal del usuario, que con email inexistente se llama con
  `fakeSalt(email)`, y que `K_L` no aparece en el resultado.
- `public-login.test.js` y `admin-users.test.js`: de extremo a extremo con la
  `loginKey` calculada con `derivarClaves` (el test importa el módulo del
  cliente, como la semilla).
- `database.test.js`: migración y rollback (D4).
- `helpers.js`: `loginKeyFor(password)` para no repetir la derivación.

## Risks / Trade-offs

- **[`K_L` se puede reutilizar]** Quien capture `K_L` (rompiendo TLS o con
  acceso al navegador) inicia sesión sin la contraseña, aunque no puede abrir
  `c_kU`. → Se documenta; la mejora es el reto-respuesta firmado con `k_U`
  (fase 2).
- **[SHA3 sin sal en el cliente]** Dos usuarios con la misma contraseña tienen
  la misma `K_L` y la misma `K_D`. → En el servidor la sal por usuario hace
  que `h_L` difiera. Para `K_D` queda anotado en la memoria (`H(pw ‖ email)` o
  KDF lento), igual que en `claves-usuario-en-alta`.
- **[Pimienta de desarrollo pública]** Sin `LOGIN_PEPPER` la pimienta está en
  el código. → Aviso en consola y en el README; en una instalación real es
  obligatoria.
- **[Rotar la pimienta invalida todos los hashes]** → Fuera de alcance; se
  anota como trabajo futuro (versionar la pimienta por usuario).
- **[Tiempo de scrypt]** `N = 2^15` tarda unas decenas de milisegundos; los
  tests de integración hacen varios logins. → Los tests que no prueban el
  servicio usan el falso; los de extremo a extremo son pocos. El equipo mide
  y ajusta.
- **[Usuarios antiguos bloqueados]** → Solo afecta a bases de desarrollo:
  `db:seed`.
- **[Dos cambios sin implementar que se tocan]** Este cambio modifica
  archivos que `claves-usuario-en-alta` también modifica
  (`user-request.js`, `UserAdminPanel.jsx`, la semilla). → Implementar primero
  `claves-usuario-en-alta` y archivarlo; este delta de
  `administracion-usuarios` ya está escrito sobre su versión.

## Migration Plan

1. Implementar y archivar `claves-usuario-en-alta`.
2. `npm run db:migrate --workspace=server`: quita `password`, añade las
   columnas.
3. `LOGIN_PEPPER=<secreto> npm run db:seed --workspace=server` (o sin
   `LOGIN_PEPPER` en desarrollo, con la de desarrollo).
4. Arrancar el servidor con la misma `LOGIN_PEPPER`.
5. Rollback: `npm run db:rollback --workspace=server` restaura `password`
   vacía; hay que volver a sembrar con el código anterior.

## Open Questions

- **`KDF` definitiva.** ¿scrypt con parámetros ajustados, Argon2id (añade
  dependencia nativa) o bcrypt? Mientras tanto, scrypt provisional.
- **Parámetros de scrypt.** `N = 2^15` es un punto de partida; el equipo mide
  en sus equipos y en Windows.
- **¿Devuelve `generarClavesUsuario` también `K_L`?** Hoy el panel llama a
  `derivarClaves` y a `generarClavesUsuario` por separado y calcula SHA3 dos
  veces. Es trivial; si `claves-usuario-en-alta` cambia la interfaz, se
  adapta la tarea 6.4.
