# Spec Delta

Sobre la spec principal `almacen-tarjetas`.

## MODIFIED Requirements

### Requirement: Datos de una tarjeta
La base de datos SHALL tener una tabla `CARD` con `id` (UUID versión 4 en
texto y en minúsculas, clave primaria, generado por el cliente), `numberIv`,
`numberCiphertext`, `expiryIv`, `expiryCiphertext`, `cvvIv`, `cvvCiphertext`
(texto en base64: los vectores de 12 bytes y los cifrados de 35, 23 y 20
bytes según `cifrado-tarjetas`), `createdAt` y `updatedAt` (fecha ISO 8601
en UTC). Todas las columnas SHALL ser obligatorias. La tabla NO SHALL tener
ninguna columna con el número, la caducidad o el CVV en claro.

#### Scenario: Valores guardados tal cual
- **WHEN** se guarda una tarjeta con unos vectores y cifrados dados
- **THEN** al leerla se obtienen exactamente los mismos textos en base64

#### Scenario: Identificador del cliente
- **WHEN** se crea una tarjeta con el `id` que envía el cliente
- **THEN** la fila tiene ese `id` en minúsculas y `createdAt` y `updatedAt` tienen la fecha de creación

#### Scenario: Identificador repetido
- **WHEN** se intenta crear una tarjeta con un `id` que ya existe en `CARD`
- **THEN** la base de datos rechaza la inserción y no cambia ninguna fila

### Requirement: Relación N:N entre usuarios y tarjetas
La base de datos SHALL tener una tabla de unión `USER_CARD` con `userId`
(clave foránea a `USER.id`), `cardId` (clave foránea a `CARD.id`), `isOwner`
(booleano), `wrappedKey` (texto en base64 obligatorio: la clave de la tarjeta
envuelta con la clave pública de ese usuario, 256 bytes) y `createdAt`, con
clave primaria compuesta `(userId, cardId)`. Ambas claves foráneas SHALL
borrarse en cascada. La tabla `CARD` NO SHALL tener ninguna columna que
apunte a un usuario ni ninguna clave envuelta: la pertenencia y la clave de
cada usuario solo se expresan en `USER_CARD`.

#### Scenario: Relación duplicada
- **WHEN** se intenta insertar dos veces la misma pareja `(userId, cardId)` en `USER_CARD`
- **THEN** la base de datos rechaza la segunda inserción

#### Scenario: Relación con un usuario inexistente
- **WHEN** se intenta insertar en `USER_CARD` un `userId` que no existe en `USER`
- **THEN** la base de datos rechaza la inserción por la clave foránea

#### Scenario: Relación sin clave envuelta
- **WHEN** se intenta insertar en `USER_CARD` una fila sin `wrappedKey`
- **THEN** la base de datos rechaza la inserción

### Requirement: Un único usuario por tarjeta en la fase 1
El repositorio de tarjetas SHALL crear cada tarjeta junto con exactamente una
fila en `USER_CARD`, la de su propietario con `isOwner = true` y su
`wrappedKey`, dentro de una misma transacción. El repositorio NO SHALL
ofrecer ninguna operación para relacionar una tarjeta existente con otro
usuario.

#### Scenario: Alta de una tarjeta
- **WHEN** el repositorio crea una tarjeta para el usuario 1 con una clave envuelta
- **THEN** existe una fila en `CARD` y exactamente una fila en `USER_CARD` con `userId = 1`, `isOwner = true` y esa `wrappedKey`

#### Scenario: Fallo a mitad del alta
- **WHEN** la inserción en `USER_CARD` falla (por ejemplo, porque el propietario no existe)
- **THEN** tampoco queda la fila en `CARD`

### Requirement: Acceso a las tarjetas a través de la relación
Toda lectura de tarjetas del repositorio SHALL hacerse a partir de un usuario
y pasar por `USER_CARD`: listar las tarjetas de un usuario y buscar una
tarjeta concreta de un usuario. Una tarjeta que no esté relacionada con ese
usuario SHALL tratarse igual que una inexistente. Cada tarjeta devuelta SHALL
indicar si el usuario es su propietario y SHALL incluir la `wrappedKey` de la
fila de `USER_CARD` de ese usuario.

#### Scenario: Listar las tarjetas propias
- **WHEN** se piden las tarjetas del empleado de prueba
- **THEN** se devuelven solo las tarjetas relacionadas con él, ordenadas por `createdAt` ascendente, cada una con `isOwner = true` y su `wrappedKey`

#### Scenario: Buscar la tarjeta de otro usuario
- **WHEN** se busca una tarjeta existente indicando un usuario que no está relacionado con ella
- **THEN** el repositorio no devuelve nada, igual que si la tarjeta no existiera

### Requirement: Modificación y borrado solo por el propietario
El repositorio SHALL ofrecer la modificación de los valores cifrados de una
tarjeta (cada uno con su vector) y su borrado indicando la tarjeta y el
usuario, y SHALL aplicar la operación solo si existe en `USER_CARD` una
relación de ese usuario con esa tarjeta con `isOwner = true`. Si no existe,
no SHALL cambiar nada e indicará que no ha encontrado la tarjeta. La
modificación SHALL actualizar `updatedAt`, conservar `id`, `createdAt` y
`wrappedKey`, y NO SHALL permitir cambiar `wrappedKey`. El borrado SHALL
eliminar la fila de `CARD` y, en cascada, todas sus filas de `USER_CARD`.

#### Scenario: Modificar la caducidad de una tarjeta propia
- **WHEN** el propietario modifica solo `expiryIv` y `expiryCiphertext` de su tarjeta
- **THEN** cambian esos dos campos y `updatedAt`, y el resto de columnas, `id`, `createdAt` y `wrappedKey` no cambian

#### Scenario: Modificar una tarjeta sin ser propietario
- **WHEN** se pide modificar o borrar una tarjeta indicando un usuario relacionado con ella con `isOwner = false`, o no relacionado
- **THEN** el repositorio indica que no la ha encontrado y la tarjeta no cambia

#### Scenario: Borrar una tarjeta propia
- **WHEN** el propietario borra su tarjeta
- **THEN** desaparecen la fila de `CARD` y todas sus filas de `USER_CARD`

### Requirement: Datos de prueba
El seed de desarrollo SHALL vaciar `USER_CARD`, `CARD` y `USER` en ese orden y
crear, además de los usuarios de prueba, una tarjeta de prueba propiedad del
empleado de prueba con un número de test que supere la comprobación de Luhn y
no corresponda a ninguna tarjeta real, cifrada con el módulo
`client/src/security/tarjetas-cifradas.js` y envuelta con la clave pública
generada para ese empleado en la misma semilla, de modo que el navegador la
descifre tras el login.

#### Scenario: Ejecutar el seed dos veces
- **WHEN** se ejecuta `npm run db:seed --workspace=server` dos veces seguidas
- **THEN** termina sin errores de clave foránea y el empleado de prueba tiene exactamente una tarjeta

#### Scenario: La tarjeta de la semilla se abre con la contraseña del empleado
- **WHEN** se abre la clave privada del empleado de prueba con `demo1234` y se descifra su tarjeta de la semilla
- **THEN** se obtiene `4111111111111111`, `12/2030` y `123`

## ADDED Requirements

### Requirement: Migración a columnas cifradas
La migración que introduce las columnas cifradas SHALL vaciar `USER_CARD` y
`CARD` antes de cambiar el esquema, porque los datos en claro no pueden
cifrarse sin el usuario, y su `down` SHALL restaurar las columnas anteriores
vaciando igualmente las tablas. El README SHALL indicar que tras migrar hay
que volver a sembrar.

#### Scenario: Migrar una base con tarjetas en claro
- **WHEN** se ejecuta la migración sobre una base de datos con tarjetas del paso 5
- **THEN** termina sin error, `CARD` y `USER_CARD` quedan vacías y con las columnas nuevas, y `USER` no cambia
