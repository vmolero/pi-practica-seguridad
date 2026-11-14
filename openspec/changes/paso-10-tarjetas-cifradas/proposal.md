# Propuesta: tarjetas cifradas de extremo a extremo

## Why

Las tarjetas siguen siendo el único dato a proteger que viaja y se guarda en
claro: `POST /api/private/cards` recibe el número, la caducidad y el CVV tal
cual y el servidor los guarda así en `CARD`. El enunciado exige cifrar los
datos con AES usando claves aleatorias gestionadas con las claves asimétricas
de cada usuario, y desde el paso 9 el navegador ya tiene en memoria `K_U` y
`k_U` del usuario al terminar el login. Este cambio implanta el cifrado
híbrido que describe `docs/diagrama-secuencia-crear-tarjeta.md`: cada
tarjeta se cifra en el navegador con una clave AES propia, esa clave se
envuelve con `K_U`, y el servidor solo guarda y devuelve texto cifrado que no
puede abrir.

## What Changes

- **Nuevo módulo de seguridad del cliente** `client/src/security/tarjetas-cifradas.js`:
  genera una clave AES-256 aleatoria `K_t` por tarjeta, cifra cada valor
  (número, caducidad `MM/AAAA` y CVV) con AES-256-GCM y un `VI` aleatorio por
  valor, autenticando como datos asociados el identificador de la tarjeta y el
  nombre del campo; envuelve `K_t` con `K_U` (RSA-OAEP); y hace la inversa con
  `k_U`. Nada de esto sale del navegador en claro.
- **BREAKING: contrato de `/api/private/cards`.** El alta recibe
  `{ "id", "number": { "iv", "ciphertext" }, "expiry": { … }, "cvv": { … }, "wrappedKey" }`
  con todo en base64 y el `id` (UUID v4) generado por el navegador; el listado
  y las respuestas del alta y la modificación devuelven esos mismos valores
  cifrados en lugar de `last4`, `expiryMonth` y `expiryYear`; la
  modificación recibe un subconjunto de los tres valores cifrados con la
  misma `K_t` y vectores nuevos. El servidor valida solo la estructura y los
  tamaños; Luhn, caducidad y CVV se comprueban únicamente en el navegador,
  que ya lo hacía.
- **BREAKING: esquema de `CARD` y `USER_CARD`.** `CARD` sustituye `number`,
  `expiryMonth`, `expiryYear` y `cvv` por `numberIv`, `numberCiphertext`,
  `expiryIv`, `expiryCiphertext`, `cvvIv` y `cvvCiphertext`; `USER_CARD`
  añade `wrappedKey`, la clave de la tarjeta envuelta para ese usuario. La
  migración vacía las tarjetas existentes (las de la semilla, que se vuelven a
  crear cifradas) porque no hay forma de cifrar datos antiguos sin el
  usuario; se documenta.
- **El navegador descifra para mostrar.** El panel «Mis tarjetas» abre `K_t`
  con `k_U`, descifra el número y la caducidad y los muestra como hasta ahora
  (`•••• 1234` y `MM/AA`); el CVV se descifra solo para comprobar la
  integridad y no se muestra. Una tarjeta cuyo cifrado no se abre o no supera
  la comprobación de integridad aparece como «Tarjeta dañada», sin datos, y
  no impide ver las demás.
- **Semilla y pruebas.** La semilla crea la tarjeta del empleado de prueba
  cifrada con el mismo módulo que usa el navegador y envuelta con su `K_U`.
  Los tests de servidor trabajan con material cifrado real generado con ese
  módulo.
- **Conflicto de identificador.** Como el `id` lo genera el navegador, el
  servidor responde `409` con `{ "error": "La tarjeta ya existe" }` si ya
  hay una tarjeta con ese `id`.

**Qué queda igual.** La autenticación, las claves del usuario, el login y la
sección de administración no cambian. El control de acceso a las tarjetas
(solo las relacionadas con el usuario del token; modificar y borrar solo el
propietario; `404` y `403` como hasta ahora) no cambia. Los campos del
formulario, sus mensajes de validación y el flujo de la interfaz (alta,
edición en la fila, borrado con confirmación) no cambian para el usuario.

**Supuestos registrados** (decididos en `design.md`):
- AES-256-GCM y no AES-128-CBC como en el diagrama: GCM aporta integridad y
  permite ligar cada valor a su tarjeta, y es lo que apuntan las notas de
  clase del 3 de noviembre. El diagrama se actualiza.
- Se cifra también la caducidad, como piden las anotaciones del enunciado; el
  servidor no puede avisar de tarjetas a punto de caducar, lo hace el
  navegador.
- Al editar se conserva `K_t` y se cifran solo los valores enviados, con
  vectores nuevos. La rotación de `K_t` queda para «descompartir» en fase 2.

**Fuera de alcance:**
- compartir tarjetas (añadir filas a `USER_CARD` con la clave envuelta para
  otro usuario) y la rotación de `K_t`;
- la firma de claves públicas y la integridad de `c_kU`, pendientes del paso 9;
- mantener la sesión al recargar la página;
- mostrar el número completo bajo demanda (hoy tampoco se muestra).

**Requisito previo.** `paso-9-abrir-clave-privada-en-login` implementado (lo
está, pendiente de revisión y archivo). Los deltas de `almacen-tarjetas` y
`panel-tarjetas` se escriben sobre las specs principales, que no han cambiado
desde el paso 5.

**Reparto.** El cifrado de tarjetas es capa de seguridad del cliente. Como en
los pasos 7 a 9, Claude escribe la implementación con Web Crypto (AES-GCM y
RSA-OAEP son los algoritmos definitivos; no hay parte provisional) contra una
interfaz pequeña, y el equipo la revisa. El resto (migración, API, semilla,
panel, tests, documentación) es [claude].

## Capabilities

### New Capabilities
- `cifrado-tarjetas`: cómo cifra, envuelve, abre y comprueba el navegador los
  datos de una tarjeta con la clave de tarjeta `K_t` y las claves del usuario,
  y qué puede y qué no puede ver el servidor.

### Modified Capabilities
- `almacen-tarjetas`: cambian «Datos de una tarjeta» (columnas cifradas, `id`
  generado por el cliente), «Relación N:N entre usuarios y tarjetas» (columna
  `wrappedKey`), «Un único usuario por tarjeta en la fase 1» (la clave
  envuelta se guarda con la relación), «Modificación y borrado solo por el
  propietario» (se modifican valores cifrados) y «Datos de prueba» (la
  tarjeta de la semilla va cifrada).
- `panel-tarjetas`: cambian «Listado de tarjetas enmascaradas» (devuelve los
  valores cifrados y la clave envuelta), «Alta de tarjetas», «Modificación de
  tarjetas», «Validación de los datos de la tarjeta» (estructura y tamaños en
  el servidor; contenido solo en el cliente), «Dashboard de tarjetas en el
  cliente» (descifra, muestra «Tarjeta dañada») y «Formulario de alta de
  tarjetas» y «Edición y borrado en el dashboard» (cifran antes de enviar).

## Impact

- **Cliente:**
  - `client/src/security/tarjetas-cifradas.js` (nuevo) y su test;
  - `client/src/api/cards.js`: cifra antes de enviar y descifra al recibir,
    usando `getUserKeys()`; nueva clase de error de tarjeta dañada;
  - `client/src/components/CardDashboard.jsx`: estado «Tarjeta dañada», `last4`
    y caducidad calculados en el navegador;
  - `client/src/validation/card.js`: sin cambios de reglas; pasa a ser la
    única validación de contenido.
- **Servidor:**
  - migración nueva `server/migrations/<fecha>_encrypt_card_columns.cjs`;
  - `server/src/infrastructure/http/card-request.js`: validación estructural
    (UUID, base64, tamaños);
  - `server/src/infrastructure/http/cards-router.js`: `409` por `id` duplicado;
  - `server/src/application/card-service.js`, `server/src/domain/card.js`
    (`toCard`, `toEncryptedCard` en lugar de `toMaskedCard`),
    `server/src/infrastructure/database/card-repository.js`
    (`createForOwner` con `id` y `wrappedKey`, lectura de `wrappedKey` por
    usuario);
  - `server/src/application/errors.js`: `CardConflictError`;
  - `server/seeds/01_usuarios_demo.cjs`: tarjeta cifrada;
  - tests: `card-request`, `card`, `card-repository`, `card-service`, `cards`,
    `database` (esquema) y `helpers.js` (material cifrado de prueba).
- **Scripts:** `scripts/generar-claves-usuario.mjs` sin cambios; script nuevo
  opcional `scripts/cifrar-tarjeta.mjs` para reproducir el ejemplo de la
  documentación (lo decide `design.md`).
- **Dependencias:** ninguna nueva.
- **Documentación afectada:**
  - `README.md`: «Estado actual» / «Seguridad» (tarjetas cifradas de extremo
    a extremo), «Vista de login» → sección del panel (qué descifra el
    navegador), «API» (contrato nuevo de `/api/private/cards` y ejemplos de
    `curl`, que ya no pueden enviar datos en claro), «Base de datos» (nuevas
    columnas y migración que vacía las tarjetas).
  - `docs/primera-memoria/implementacion-y-seguridad.md`: sección nueva
    «Tarjetas cifradas de extremo a extremo (paso 10)» con flujo de alta,
    listado y edición, quién conoce cada dato y «Lo que este paso no
    protege»; actualizar la descripción del paso 5 (CRUD en claro), «Lo que
    este paso no protege» del paso 9 (`k_U` ya se usa) y «Trabajo futuro».
  - `docs/primera-memoria/manual-de-usuario.md`: «Mis tarjetas» (los datos se
    cifran en el navegador, estado «Tarjeta dañada»).
  - `docs/primera-memoria/stack-tecnologico.md`: AES-GCM de Web Crypto en uso.
  - `docs/criptografia-implementada.md`: este cambio añade código
    criptográfico (AES-GCM, envoltura RSA-OAEP), así que hay que actualizar la
    tabla «Dónde está el código», añadir la operación «Guardar y leer una
    tarjeta», el ejemplo con valores reales reproducible y la tabla «Qué es
    provisional y qué falta».
  - `docs/diagrama-secuencia-crear-tarjeta.md`: «Estado» pasa a implantado;
    AES-GCM, nombres reales de los campos y notas de «Puntos que hay que
    decidir» resueltas.
  - `docs/glosario-simbolos-diagramas.md`: símbolos de `K_t`, `w_U` y los
    `VI_x`/`c_x` si faltan.
