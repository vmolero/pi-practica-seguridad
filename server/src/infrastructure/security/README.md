# Servicio de tokens de sesión

Este directorio es la **capa de seguridad** del token de sesión: la firma y la
verificación criptográfica del JWT. Según el reparto del proyecto, la
implementación definitiva es del **equipo**. Mientras tanto, `token-service.js`
contiene una implementación **provisional** de Claude (HMAC-SHA256 con un
secreto del entorno, mediante la librería `jose`).

## Contrato

```js
createTokenService({ secret, ttlSeconds, issuer, now }) → { sign, verify }
```

- `ttlSeconds`: tiempo de vida del token en segundos.
- `issuer`: valor del claim `iss` (`"tarjetas-de-empresa"`).
- `now`: función que devuelve el instante actual en milisegundos; por defecto
  `Date.now`. Solo los tests la cambian.
- `secret`: material de claves de la implementación provisional. La
  implementación del equipo puede sustituirlo por sus propias claves (por
  ejemplo, `privateKey` y `publicKey`).

`sign(claims) → Promise<string>`

- Recibe los claims propios de la sesión: `{ sub, email, name, isAdmin }`
  (ver `src/domain/session.js`).
- Añade `iss`, `iat` (segundos UNIX según `now`) y `exp = iat + ttlSeconds`.
- Devuelve un JWT compacto: `base64url(cabecera).base64url(claims).base64url(firma)`.

`verify(token) → Promise<claims>`

- Devuelve todos los claims si el token es válido.
- Lanza `InvalidTokenError` (de `src/application/errors.js`) ante cualquier
  fallo: formato ilegible, algoritmo no admitido (incluido `none`), firma
  incorrecta, `iss` distinto o token caducado (`exp <= now`, sin tolerancia).
- El algoritmo admitido es fijo en la implementación: nunca se usa el `alg`
  que declare el token.

## Tests de contrato

`test/token-service.contract.js` exporta `runTokenServiceContractTests`, que
toda implementación debe superar sin modificar el archivo.
`test/token-service.test.js` la ejecuta contra la implementación provisional.
Para la del equipo basta con añadir otro archivo de test que la invoque con sus
propias fábricas.

## Reparto

| Parte | Responsable |
| --- | --- |
| Algoritmo de firma, generación y custodia de claves, `sign` y `verify` | Equipo |
| Claims, caducidad, middleware, router privado, cliente y tests | Claude |

# Servicio de clave de login

`login-key-service.js` es la capa de seguridad del **paso 8**: el hash lento
de la clave de login `K_L` con sal y pimienta, su verificación en tiempo
constante y la sal ficticia para emails inexistentes. Como con el token, la
implementación definitiva es del **equipo**; mientras tanto el archivo
contiene una implementación **provisional** de Claude con `scrypt` de
`node:crypto`.

## Esquema

```
h_L = KDF(K_L ‖ pimienta, sal)
```

- `K_L`: 16 bytes que el navegador deriva de la contraseña
  (`client/src/security/claves-usuario.js`, `derivarClaves`). El servidor
  nunca ve la contraseña.
- `sal`: 16 bytes aleatorios por usuario, en `USER.loginKeySalt` (base64).
- `pimienta`: `LOGIN_PEPPER` (`src/config.js`), igual para todos los usuarios
  y fuera de la base de datos. Sin ella se usa una pimienta de desarrollo
  pública, con aviso en consola.
- `h_L`: `USER.loginKeyHash` (base64).

## Contrato

```js
createLoginKeyService({ pepper }) → { newSalt, hash, verify, fakeSalt }
```

- `newSalt() → string`: 16 bytes aleatorios en base64, distintos cada vez.
- `hash(loginKey, salt) → Promise<string>`: `loginKey` es un `Uint8Array` de
  16 bytes y `salt` la sal en base64. Devuelve `h_L` en base64. Determinista
  para los mismos argumentos y la misma pimienta; cambia si cambia cualquiera.
- `verify(loginKey, salt, expectedHash) → Promise<boolean>`: recalcula el hash
  y lo compara con `expectedHash` en tiempo constante (`timingSafeEqual`). Si
  `expectedHash` tiene otra longitud o no es base64 bien formado devuelve
  `false`, pero calcula el hash igualmente para tardar lo mismo.
- `fakeSalt(email) → string`: sal ficticia determinista para un email que no
  existe, de 16 bytes en base64 y distinta entre emails. El servicio de
  autenticación la usa para verificar contra un hash ficticio y así tardar
  lo mismo que con un usuario real.
- `loginKey` que no sea un `Uint8Array` de 16 bytes → `TypeError`.

## Implementación provisional

| Parámetro | Valor |
|---|---|
| KDF | `scrypt` (`node:crypto`), nativo en Windows y Linux |
| `N`, `r`, `p` | `2^15`, `8`, `1` (unas decenas de milisegundos por hash) |
| Salida | 32 bytes |
| Entrada | bytes de `K_L` seguidos de los bytes UTF-8 de la pimienta |
| `fakeSalt` | `HMAC-SHA-256(pimienta, email)` truncado a 16 bytes |

## Tests de contrato

`test/login-key-service.contract.js` exporta
`runLoginKeyServiceContractTests(createService)`, que toda implementación
debe superar sin modificar el archivo. `test/login-key-service.test.js` la
ejecuta contra la provisional. Para la del equipo basta con añadir otro
archivo de test que la invoque con su fábrica. Al cambiar la implementación
hay que volver a sembrar (`npm run db:seed --workspace=server`): los hashes
anteriores dejan de valer.

## Reparto

| Parte | Responsable |
| --- | --- |
| Elección de la KDF (scrypt con parámetros medidos, Argon2id o bcrypt) y sus parámetros, `hash`, `verify` y `fakeSalt` | Equipo |
| Contrato, tests de contrato, sal y pimienta en configuración, servicio de autenticación, alta, semilla, cliente y documentación | Claude |
