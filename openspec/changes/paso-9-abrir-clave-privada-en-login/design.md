# Diseño: abrir la clave privada del usuario en el login

## Context

Tras los pasos 7 y 8, la fila de `USER` tiene `publicKey` (`K_U`, SPKI en
base64), `privateKeyIv` (`VI`) y `encryptedPrivateKey` (`c_kU = E_K_D(k_U)`,
AES-128-CBC sobre el PKCS#8), además de `loginKeySalt` y `loginKeyHash`. En el
login, `client/src/api/auth.js` deriva `{ K_L, K_D }`, envía `K_L`, y con un
`200` guarda el token y `K_D` en `client/src/api/session.js`. El servidor
(`auth-service.js`) devuelve `{ token, user }` y `user-repository.findByEmail`
no selecciona las columnas de claves. `client/src/security/claves-usuario.js`
ya tiene `abrirClavePrivada(pw, { encryptedPrivateKey, privateKeyIv })`, que
deriva `K_D` de `pw` y devuelve la `CryptoKey` privada, no exportable, con uso
`decrypt`; e `importarClavePublica(publicKey)`.

Restricciones: todo en JavaScript; solo Web Crypto en el cliente (sin
librerías nuevas); Windows y Linux; nada de la sesión en almacenamiento
persistente; el módulo de seguridad del cliente mantiene su interfaz para que
el equipo pueda sustituir `H` sin tocar el resto.

## Goals / Non-Goals

**Goals:**
- Que al terminar el login el navegador tenga `K_U` y `k_U` listas para usar
  (`CryptoKey`), y que `K_D` ya no esté en memoria.
- Que el servidor entregue `c_kU`, `VI` y `K_U` solo al usuario que acaba de
  demostrar que conoce `K_L`.
- Que un `c_kU` que no se abre, o que no corresponde a `K_U`, no deje al
  usuario dentro de una sesión a medias.
- Que el estado sea visible (fila en «Tu cuenta») y comprobable en el
  navegador.

**Non-Goals:**
- Usar `k_U` para algo todavía (cifrar tarjetas, reto-respuesta): es el
  cambio siguiente.
- Cambiar el esquema de `USER`, la semilla, el alta o el servicio de clave de
  login.
- Autenticar el contenido de `c_kU` (AES-GCM o MAC). Se anota como riesgo.
- Sobrevivir a una recarga de la página.

## Decisions

### D1. Las claves viajan en la respuesta del login

`POST /api/public/login` responde `{ token, user, keys }` con
`keys = { publicKey, privateKeyIv, encryptedPrivateKey }` (base64, tal cual
en `USER`) o `keys = null` si falta alguna de las tres columnas.

- **Por qué en el login y no en un `GET /api/private/me/keys`:** es lo que
  dibuja `docs/diagrama-secuencia-login.md`; ahorra una petición y, sobre
  todo, evita un estado intermedio en el cliente («token válido pero claves
  sin pedir») que habría que gestionar en `App.jsx`. La condición de entrega
  es la misma en los dos diseños: haber superado la verificación de `K_L`.
- **Por qué `keys: null` y no `401`:** un usuario con `loginKeyHash` pero sin
  claves no existe hoy (desde el paso 7 el alta exige las tres y desde el
  paso 8 exige `loginKey`; la semilla crea ambas cosas), pero el esquema las
  admite a `NULL`. Devolver `null` deja el dato en manos del cliente, que es
  quien decide no entrar; el servidor no inventa un error de credenciales
  para un caso que no lo es.
- **Qué no viaja:** `loginKeySalt` y `loginKeyHash` siguen fuera de toda
  respuesta. `keys` solo aparece en el `200`; el `401` no cambia.

### D2. El servidor no cambia su lógica de verificación

`findByEmail` añade las tres columnas al `select`. `auth-service.login`
construye `keys` con `toUserKeys(user)` (función nueva en
`server/src/domain/user.js`, junto a `toPublicUser`), que devuelve `null` si
falta alguna. El orden de las comprobaciones (usuario inexistente, hash nulo,
`verify`) no se toca; `keys` solo se lee después de que `verify` haya
devuelto `true`. `public-router` sigue devolviendo lo que le da el servicio.

### D3. Apertura y comprobación en el cliente, dentro de `auth.login`

Tras el `200`:

1. `abrirClavePrivadaConKD(K_D, { encryptedPrivateKey, privateKeyIv })` →
   `k_U` (`CryptoKey`, `extractable: false`, uso `decrypt`). Se añade esta
   variante a `claves-usuario.js` porque el login ya tiene `K_D` y no debe
   volver a derivarla; `abrirClavePrivada(pw, …)` pasa a ser una envoltura
   que deriva `K_D` y llama a la nueva. Lanza `ClavePrivadaError` si el
   relleno PKCS#7 o el PKCS#8 no son válidos.
2. `importarClavePublica(publicKey)` → `K_U` (`CryptoKey`, uso `encrypt`).
3. `comprobarParDeClaves(K_U, k_U)`: `r` = 32 bytes aleatorios;
   `D_k_U(E_K_U(r)) === r`. Devuelve `false` ante cualquier excepción de
   `subtle.decrypt`. Detecta un `c_kU` que se abre «por casualidad» (relleno
   válido con una clave equivocada, improbable pero posible) y un servidor
   que haya mezclado claves de dos usuarios.
4. `setToken(token)`, `setUserKeys({ publicKey: K_U, privateKey: k_U })`.
5. `K_D.fill(0)` en un `finally`, pase lo que pase.

Si 1, 2 o 3 fallan, o `keys` es `null`: no se guarda el token, se lanza
`Error(PRIVATE_KEY_ERROR)` con
`No se ha podido abrir tu clave privada. Vuelve a intentarlo.`. El token
recibido se descarta sin usar: no hay nada que invalidar en el servidor
(sesiones sin estado).

- **Por qué comprobar el par y no fiarse del descifrado:** el coste es un
  RSA-OAEP de 2048 bits (milisegundos) y cierra los dos casos anteriores.
  Es la comprobación con `r` del diagrama.
- **Por qué borrar `K_D`:** el paso 8 la conservaba «para los pasos
  siguientes»; el único uso previsto era este. Conservarla solo serviría para
  un cambio de contraseña, que de todos modos deriva una `K_D` nueva.
  Modifica el requisito «Login desde la pantalla del cliente» del paso 8 y
  el escenario «Nada persistido».

### D4. Sesión en memoria: `session.js`

```js
setUserKeys({ publicKey, privateKey })  // CryptoKey, CryptoKey
getUserKeys()                           // { publicKey, privateKey } | null
clearSession()                          // token, K_D y claves a null
```

`clearSession` ya se llama en `logout()` y en `apiFetch` ante un `401`. Una
`CryptoKey` no exportable no se puede «borrar» como un `Uint8Array`; soltar
la referencia es lo máximo que ofrece Web Crypto. `getDataKey` se mantiene
por compatibilidad pero devolverá `null` tras el login; se elimina cuando no
quede ningún uso.

### D5. Vista de sesión

`SessionView.jsx` añade una fila `Clave privada` → `Abierta en este
navegador` si `getUserKeys()` no es `null`. No hay estado alternativo visible
porque, por D3, con las claves cerradas no se entra en la vista de sesión.
Sirve para la verificación manual y para que el manual de usuario pueda
nombrarla.

### D6. Mensajes

| Situación | Mensaje | Dónde |
|---|---|---|
| `401` del login | `Email o contraseña incorrectos.` (sin cambio) | `auth.js` |
| Error de red u otro estado | `No se ha podido iniciar sesión. Inténtalo de nuevo.` (sin cambio) | `auth.js` |
| `keys: null`, apertura o comprobación fallida | `No se ha podido abrir tu clave privada. Vuelve a intentarlo.` | `auth.js`, nuevo `PRIVATE_KEY_ERROR` |

El tercero no revela si la clave de login era correcta más de lo que ya revela
un `200` que el cliente acaba de recibir; no es un canal nuevo.

### D7. Tests

- **Servidor:** `user-repository.test.js` (`findByEmail` trae las tres
  columnas); `auth-service.test.js` (`login` devuelve `keys` con los valores
  del repositorio, `null` si falta alguna, y nunca `loginKeySalt` ni
  `loginKeyHash`); `public-login.test.js` (el `200` trae `keys` iguales a la
  fila de la semilla, el `401` no trae `keys`, usuario con claves a `NULL`
  recibe `keys: null`); `admin-users.test.js` ya comprueba que las
  respuestas de administración no exponen claves, se mantiene.
- **Cliente, módulo de seguridad:** `claves-usuario.test.js` añade
  «apertura con `K_D`», «`comprobarParDeClaves` verdadero con el par
  propio», «falso con la privada de otro par» y «falso, sin excepción, con
  un `c_kU` manipulado que se abre pero no corresponde» (si no se consigue
  fabricar, se cubre con la privada de otro par).
- **Cliente, `auth.js` y `session.js`:** no tienen tests hoy (23 tests de
  cliente son `claves-usuario` y `validation/card`). Se añade
  `client/src/api/session.test.js` (`node --test`, sin DOM) para
  `setUserKeys`/`getUserKeys`/`clearSession`. `auth.login` depende de
  `fetch`; se verifica en el navegador (tarea de verificación), no con test
  unitario, igual que en el paso 8.
- **Navegador:** login correcto muestra la fila `Clave privada`, `K_D` ya no
  está en memoria (`getDataKey()` es `null` desde la consola), nada en
  `localStorage`/`sessionStorage`/cookies, cierre de sesión borra las
  claves; y el caso de fallo, provocado poniendo `encryptedPrivateKey` a un
  valor corrupto en `app.sqlite` para un usuario de prueba.

## Risks / Trade-offs

- **[`c_kU` sin integridad]** CBC no detecta manipulación. Un servidor
  malicioso puede devolver un `c_kU` alterado; lo peor que consigue es que
  la apertura falle (relleno) o que `comprobarParDeClaves` devuelva `false`.
  No puede hacer que el navegador acepte una clave privada que no corresponde
  a `K_U`… salvo que también cambie `K_U`, en cuyo caso el usuario queda con
  un par que el servidor conoce. → Mitigación de este paso: el fallo es
  visible y no entra en sesión. Mitigación futura: firmar `K_U` (firma de
  claves públicas, en el enunciado) y AES-GCM para `c_kU`; anotado en
  «Trabajo futuro».
- **[`k_U` en memoria del navegador]** Una extensión maliciosa o XSS puede
  usar `k_U` mientras dura la sesión, aunque no exportarla. → Es inherente al
  cifrado en el navegador; `extractable: false` limita el daño a la sesión.
  No hay CSP todavía; se anota.
- **[Respuesta de login más grande]** Unos 2 KB más por login. → Irrelevante.
- **[Cambio de contrato de `auth-service.login`]** Devuelve un campo más;
  cualquier consumidor que haga `deepEqual` sobre la respuesta se rompe. →
  Solo `public-login.test.js` y `admin-users.test.js`; se actualizan.
- **[Usuarios antiguos]** Con `keys: null` no pueden entrar aunque su clave de
  login sea correcta. → No existen en la práctica (ver D1); si aparecieran,
  se recrean con el panel.

## Migration Plan

Sin migración de base de datos. Orden de implementación: módulo de seguridad
del cliente → sesión → servidor → `auth.js` → vista → verificación →
documentación. Vuelta atrás: `git revert` del commit; no hay datos que
deshacer.

## Open Questions

- Ninguna que bloquee. Queda apuntado para el siguiente cambio si las claves
  deben recuperarse también en `GET /api/private/me` para un futuro «mantener
  la sesión al recargar», que hoy no existe.
