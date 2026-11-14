# Diseño: tarjetas cifradas de extremo a extremo

## Context

Hoy `POST /api/private/cards` recibe `{ number, expiryMonth, expiryYear, cvv }`
en claro, `card-request.js` valida el contenido (Luhn, caducidad, CVV), el
repositorio guarda las cuatro columnas en `CARD` y `toMaskedCard` devuelve
`{ id, last4, expiryMonth, expiryYear, createdAt }`. El panel
(`CardDashboard.jsx`) valida con `validation/card.js` las mismas reglas antes
de enviar, muestra `•••• last4` y `MM/AA`, edita en la fila enviando solo los
campos cambiados y borra con confirmación. `USER_CARD` relaciona usuario y
tarjeta con `isOwner`. Tras el paso 9 el navegador tiene `K_U` (`CryptoKey`
RSA-OAEP, uso `encrypt`) y `k_U` (uso `decrypt`, no exportable) en
`session.js`. `claves-usuario.js` ya ofrece `toBase64`/`fromBase64` e
`importarClavePublica`.

Restricciones: solo Web Crypto en el cliente, sin librerías nuevas; el mismo
módulo debe funcionar en Node (semilla, scripts y tests, como
`claves-usuario.js`); Windows y Linux; nada de la sesión ni de los datos
descifrados en almacenamiento persistente ni en la consola; la notación de la
memoria debe ser inequívoca.

## Goals / Non-Goals

**Goals:**
- Que el servidor nunca vea ni pueda obtener el número, la caducidad ni el CVV
  de ninguna tarjeta, ni en tránsito ni en reposo.
- Que cualquier alteración de un valor cifrado, de su `VI` o su traslado a
  otra tarjeta o a otro campo se detecte en el navegador.
- Que la experiencia del panel sea la misma que hoy.
- Que todo sea reproducible desde Node con los usuarios de la semilla.

**Non-Goals:**
- Compartir tarjetas, rotar `K_t` o «descompartir» (fase 2).
- Firmar `K_U`, proteger la integridad de `c_kU` o añadir CSP (pendientes del
  paso 9).
- Mostrar el número completo bajo demanda.
- Conservar las tarjetas creadas antes de este cambio: solo existen las de la
  semilla.

## Decisions

### D1. Cifrado híbrido por tarjeta: AES-256-GCM por valor y `K_t` envuelta con RSA-OAEP

Por tarjeta, el navegador genera `K_t`: 32 bytes de `crypto.getRandomValues`.
Por valor (`number`, `expiry`, `cvv`): `VI_x` de 12 bytes aleatorios y
`c_x = E_K_t(m_x)` con AES-256-GCM, etiqueta de 128 bits y datos asociados
`AAD_x = UTF-8("<id>:<campo>")`, donde `<id>` es el UUID de la tarjeta y
`<campo>` es `number`, `expiry` o `cvv`. La clave se envuelve como
`w_U = E_K_U(K_t)` con RSA-OAEP (SHA-256) sobre los 32 bytes en crudo; con
RSA de 2048 bits, `w_U` mide 256 bytes.

- **GCM y no CBC** (el diagrama decía AES-128-CBC): GCM detecta cualquier
  modificación del cifrado o del `VI` y los datos asociados ligan cada valor a
  su tarjeta y a su campo, que es lo que el diagrama dejaba en «Puntos que hay
  que decidir». Las notas de clase del 3 de noviembre apuntan a AES-GCM con
  datos asociados. `c_kU` sigue en CBC: cambiarlo es otro cambio.
- **256 bits**: no cuesta nada en Web Crypto y es lo que decían las notas y la
  propuesta de fase 1. `K_D` sigue siendo de 128 bits porque la fija la
  derivación del enunciado.
- **Un cifrado por valor y no uno por tarjeta**: es la anotación literal del
  enunciado («el JSON se envía en texto claro con los valores de cada clave
  cifrados») y permite editar un solo campo sin tocar los demás.
- **AAD sin el identificador del propietario**: el cliente no conoce su `id`
  numérico (el login devuelve `email`, `name`, `isAdmin`) y en fase 2 una
  tarjeta compartida se descifra en otro usuario. Mover una tarjeta completa
  a otro usuario no sirve de nada al atacante: `w_U` solo se abre con la
  `k_U` del propietario.
- **`subtle.encrypt` con RSA-OAEP en lugar de `wrapKey`/`unwrapKey`**: `K_U`
  y `k_U` se importaron en los pasos 7 y 9 con usos `encrypt` y `decrypt`;
  `wrapKey` exigiría cambiar esos usos y hacer `K_t` exportable. Cifrar los
  32 bytes en crudo es equivalente, coincide con la notación `E_K_U(K_t)` de
  la memoria y permite importar `K_t` como `CryptoKey` no exportable. Los 32
  bytes en crudo se ponen a cero en cuanto se importa la clave.

### D2. Textos en claro de tamaño fijo

Antes de cifrar, el número se rellena por la izquierda con espacios hasta 19
caracteres y el CVV hasta 4; la caducidad es siempre `MM/AAAA` (7). Al
descifrar se quitan los espacios. Así cada cifrado tiene un tamaño fijo
(texto + 16 bytes de etiqueta):

| Valor | Texto en claro | `c_x` (bytes) |
|---|---|---|
| `number` | 19 caracteres | 35 |
| `expiry` | 7 caracteres | 23 |
| `cvv` | 4 caracteres | 20 |

- **Por qué**: sin relleno, el tamaño de `c_num` revela cuántos dígitos tiene
  el número y el de `c_cvv` si la tarjeta es Amex. Con tamaños fijos el
  servidor puede validar la estructura con una igualdad exacta y no hay fuga.
- **Alternativa descartada**: cifrar un JSON con los tres valores. Un solo
  cifrado por tarjeta ocultaría todavía más, pero contradice la anotación del
  enunciado y obliga a recifrar todo en cada edición.

### D3. Contrato de la API

Todo en base64. El servidor recibe y devuelve exactamente lo que guarda.

```
POST /api/private/cards
{ "id": "<uuid v4>",
  "number": { "iv": "<12 B>", "ciphertext": "<35 B>" },
  "expiry": { "iv": "<12 B>", "ciphertext": "<23 B>" },
  "cvv":    { "iv": "<12 B>", "ciphertext": "<20 B>" },
  "wrappedKey": "<256 B>" }
→ 201 { "id", "number", "expiry", "cvv", "wrappedKey", "createdAt" }
→ 400 { "error": "Datos de tarjeta no válidos" }   (estructura o tamaños)
→ 409 { "error": "La tarjeta ya existe" }           (id repetido)

GET /api/private/cards → 200 { "cards": [ { "id", "number", "expiry", "cvv", "wrappedKey", "createdAt" } ] }

PATCH /api/private/cards/:id
{ subconjunto no vacío de "number", "expiry", "cvv", cada uno { "iv", "ciphertext" } }
→ 200 con la tarjeta completa, como en el listado

DELETE /api/private/cards/:id → 204 (sin cambio)
```

- **El `id` lo genera el navegador** (`crypto.randomUUID()`), porque entra en
  los datos asociados antes de cifrar. El servidor lo exige en el alta, lo
  valida como UUID v4, lo normaliza a minúsculas y responde `409` si ya
  existe. `cardId` del diagrama pasa a llamarse `id`, como en el resto de la
  API.
- **`wrappedKey` viene de `USER_CARD`**, de la fila del usuario que lista,
  no de `CARD`: es lo que prepara la fase 2 (una envoltura por usuario). El
  listado ya hace ese `join`.
- **El servidor no devuelve `updatedAt`** y la modificación no admite cambiar
  `wrappedKey` ni `id`, igual que hoy no admite cambiar `id`.
- **Validación estructural en `card-request.js`**: objeto JSON con solo los
  campos admitidos; `id` UUID v4; cada valor un objeto con solo `iv` y
  `ciphertext`, ambos base64 válido (`^[A-Za-z0-9+/]+={0,2}$` y longitud
  múltiplo de 4) que decodifica a los tamaños de D2 y a 12 bytes de `iv`;
  `wrappedKey` base64 de 256 bytes. Las funciones de contenido (`passesLuhn`,
  caducidad, CVV) se eliminan del servidor; `validation/card.js` del cliente
  no cambia y pasa a ser la única comprobación de contenido.

### D4. Esquema y migración

Migración nueva `server/migrations/20261110180000_encrypt_card_columns.cjs`:

1. `DELETE FROM USER_CARD` y `DELETE FROM CARD` (no hay forma de cifrar lo que
   ya existe; solo hay tarjetas de la semilla).
2. `CARD`: quitar `number`, `expiryMonth`, `expiryYear`, `cvv`; añadir
   `numberIv`, `numberCiphertext`, `expiryIv`, `expiryCiphertext`, `cvvIv`,
   `cvvCiphertext` (`text`, `notNullable`). `id`, `createdAt` y `updatedAt`
   se conservan.
3. `USER_CARD`: añadir `wrappedKey` (`text`, `notNullable`).

`down` deshace las columnas (también vaciando las tablas). Knex recrea la
tabla en SQLite al quitar columnas; el índice parcial `user_card_one_owner`
está en `USER_CARD`, que solo recibe una columna nueva, así que no se toca.
Tras migrar hay que volver a sembrar: el README lo dice.

### D5. Módulo de seguridad del cliente: `client/src/security/tarjetas-cifradas.js`

```js
cifrarTarjeta(K_U, { id, number, expiry, cvv })
  → { id, number: { iv, ciphertext }, expiry: {…}, cvv: {…}, wrappedKey }   // base64
abrirClaveTarjeta(k_U, wrappedKey)        → K_t (CryptoKey AES-GCM, no exportable, encrypt+decrypt)
cifrarValores(K_t, id, { number?, expiry?, cvv? })
  → { number?: { iv, ciphertext }, … }    // para la edición, con VI nuevos
descifrarTarjeta(k_U, tarjetaCifrada)     → { id, number, expiry, cvv }     // lanza TarjetaCifradaError
```

`expiry` es siempre la cadena `MM/AAAA`; la conversión desde y hacia
`expiryMonth`/`expiryYear` se hace en `cards.js`, no en el módulo. Cualquier
fallo de descifrado (GCM rechaza la etiqueta, `w_U` no se abre, tamaño
inesperado) lanza `TarjetaCifradaError` sin distinguir la causa. Reutiliza
`toBase64`/`fromBase64` de `claves-usuario.js`. Sin dependencias del DOM, para
que funcione en Node.

- **`K_t` con usos `encrypt` y `decrypt`** porque la edición vuelve a cifrar
  con la misma clave (D6). No exportable: lo máximo que ofrece Web Crypto.
- **El módulo no sabe nada de `session.js`**: recibe las `CryptoKey`. Es la
  interfaz que revisa el equipo.

### D6. Edición: misma `K_t`, vectores nuevos

Al guardar una edición, `cards.js` abre `K_t` con `k_U` a partir del
`wrappedKey` que el listado guardó en el estado del panel, cifra solo los
valores cambiados con `cifrarValores` (vectores nuevos) y envía el `PATCH`.

- **Por qué no una `K_t` nueva**: obligaría a recifrar los tres valores y a
  cambiar `wrappedKey` en cada edición, y la fase 2 necesitará la rotación de
  todos modos para «descompartir»; se hará entonces, con `version`. Con
  vectores GCM de 96 bits aleatorios y unas pocas operaciones por clave el
  riesgo de repetir un vector es despreciable.
- **El estado del panel guarda `wrappedKey` y los valores cifrados** de cada
  tarjeta (texto cifrado, inofensivo), y de los descifrados solo `last4`,
  `expiryMonth` y `expiryYear`. El número completo y el CVV descifrados se
  descartan en cuanto se calcula el resumen.

### D7. Cliente: `cards.js` y el panel

`cards.js` encapsula todo el cifrado, de modo que `CardDashboard.jsx` sigue
hablando de `{ id, last4, expiryMonth, expiryYear, createdAt }`:

- `listCards()` → `[{ id, last4, expiryMonth, expiryYear, createdAt, wrappedKey, encrypted }]`,
  o `{ id, createdAt, damaged: true }` si `descifrarTarjeta` falla para esa
  tarjeta. Nunca lanza por una tarjeta dañada.
- `createCard({ number, expiryMonth, expiryYear, cvv })` → genera `id`, cifra
  con `getUserKeys().publicKey`, hace el `POST` y devuelve el mismo resumen.
- `updateCard(card, changes)` → abre `K_t`, cifra los cambios, hace el
  `PATCH` y devuelve el resumen de la respuesta.
- `deleteCard(id)` sin cambios.
- Si `getUserKeys()` es `null` (no debería ocurrir: sin claves no hay
  sesión), lanza `SessionExpiredError` para volver al login.

El panel añade el estado «Tarjeta dañada»: la fila muestra
`Tarjeta dañada: no se ha podido descifrar.` en lugar del número y la
caducidad, sin botón «Editar» y con «Eliminar». Los mensajes de validación y
el resto del flujo no cambian.

### D8. Semilla, pruebas y script de ejemplo

- **Semilla**: tras crear el empleado, importa su `publicKey` con
  `importarClavePublica`, cifra la tarjeta `4111111111111111`, `12/2030`,
  `123` con `cifrarTarjeta` y guarda las columnas y `wrappedKey`. La semilla
  ya importa el módulo del cliente.
- **`server/test/helpers.js`**: `encryptedTestCard(publicKey, { id?, number?, expiry?, cvv? })`
  genera cuerpos válidos con el módulo del cliente y las claves de prueba;
  `cards.test.js` cifra para el empleado de la semilla leyendo su `publicKey`
  de `USER`, y comprueba que el `GET` devuelve exactamente lo enviado y que
  `descifrarTarjeta` con la `k_U` del empleado (abierta con `demo1234`) lo
  recupera.
- **`scripts/cifrar-tarjeta.mjs <email> <contraseña> <número> <MM/AAAA> <cvv>`**:
  lee `publicKey`, `encryptedPrivateKey` y `privateKeyIv` del usuario en
  `server/data/app.sqlite`, cifra la tarjeta y escribe el cuerpo JSON para
  `curl`; con `--abrir` descifra lo que recibe por entrada estándar con la
  contraseña. Da el ejemplo reproducible de `docs/criptografia-implementada.md`
  y los ejemplos de `curl` del README, que ya no pueden enviar texto claro.

## Risks / Trade-offs

- **[El servidor ya no valida el contenido]** Un cliente modificado puede
  guardar basura cifrada. → Es su propia tarjeta y solo él puede leerla; el
  servidor sigue validando estructura y tamaños, así que no puede almacenar
  más de ~400 bytes por tarjeta ni romper el listado de nadie.
- **[`k_U` y `K_t` en memoria del navegador]** Una extensión maliciosa o XSS
  puede descifrar mientras dura la sesión. → Inherente al cifrado en el
  navegador; `extractable: false`, nada en almacenamiento, CSP pendiente
  (paso 9).
- **[Un servidor malicioso puede borrar o duplicar tarjetas]** No puede
  leerlas ni alterarlas sin que se note, pero sí ocultarlas o repetirlas. →
  Fuera de alcance de la confidencialidad; se anota en «Lo que este paso no
  protege».
- **[`c_kU` sigue sin integridad]** Si el servidor sustituye `c_kU` y `K_U`
  por un par suyo, cualquier tarjeta nueva se envuelve para él. → Riesgo
  heredado del paso 9, ya anotado; firma de `K_U` como trabajo futuro.
- **[Migración destructiva]** Borra las tarjetas existentes. → Solo hay datos
  de semilla; se documenta en README y en la memoria.
- **[Tests más lentos]** Cifrar en cada test exige RSA-OAEP y AES-GCM. → Son
  milisegundos; RSA 2048 se genera una vez por proceso (`getTestUserKeys`).
- **[Cambio de contrato]** Cualquier cliente antiguo recibe `400`. → Solo
  existe el panel, que cambia a la vez.

## Migration Plan

Orden de implementación: módulo de seguridad del cliente y sus tests →
migración y semilla → servidor (`card-request`, dominio, repositorio,
servicio, router, tests) → `cards.js` y panel → script y verificación en el
navegador → documentación. Despliegue: `npm run db:migrate` y
`npm run db:seed` en el servidor. Vuelta atrás: `git revert` y
`knex migrate:rollback` seguido de `db:seed`.

## Open Questions

- Ninguna que bloquee. Para fase 2: al compartir, el propietario abrirá `K_t`
  y la envolverá con la `K_U` del otro usuario, añadiendo la fila de
  `USER_CARD`; los datos asociados no incluyen al usuario, así que no hay que
  recifrar.
