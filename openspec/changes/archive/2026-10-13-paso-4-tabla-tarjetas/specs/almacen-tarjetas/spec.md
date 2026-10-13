# Spec Delta

## Purpose

Define cómo se guardan las tarjetas y su relación con los usuarios: una
relación N:N preparada para compartir tarjetas en la fase 2, con un único
propietario por tarjeta y, en la fase 1, un único usuario por tarjeta.

## ADDED Requirements

### Requirement: Datos de una tarjeta
La base de datos SHALL tener una tabla `CARD` con `id` (UUID en texto, clave
primaria), `number` (texto de 13 a 19 dígitos), `expiryMonth` (entero de 1 a
12), `expiryYear` (entero de cuatro cifras), `cvv` (texto de 3 o 4 dígitos),
`createdAt` y `updatedAt` (fecha ISO 8601 en UTC). Todas las columnas SHALL
ser obligatorias. El número y el CVV SHALL guardarse como texto para conservar
los ceros a la izquierda. De forma PROVISIONAL, los datos se guardan en texto
claro hasta la fase 1.

#### Scenario: CVV con ceros a la izquierda
- **WHEN** se guarda una tarjeta cuyo CVV es `012`
- **THEN** al leerla se obtiene exactamente `012`

#### Scenario: Identificador generado
- **WHEN** se crea una tarjeta
- **THEN** su `id` es un UUID versión 4 y `createdAt` y `updatedAt` tienen la fecha de creación

### Requirement: Relación N:N entre usuarios y tarjetas
La base de datos SHALL tener una tabla de unión `USER_CARD` con `userId`
(clave foránea a `USER.id`), `cardId` (clave foránea a `CARD.id`), `isOwner`
(booleano) y `createdAt`, con clave primaria compuesta `(userId, cardId)`.
Ambas claves foráneas SHALL borrarse en cascada. La tabla `CARD` NO SHALL tener
ninguna columna que apunte a un usuario: la pertenencia solo se expresa en
`USER_CARD`.

#### Scenario: Relación duplicada
- **WHEN** se intenta insertar dos veces la misma pareja `(userId, cardId)` en `USER_CARD`
- **THEN** la base de datos rechaza la segunda inserción

#### Scenario: Relación con un usuario inexistente
- **WHEN** se intenta insertar en `USER_CARD` un `userId` que no existe en `USER`
- **THEN** la base de datos rechaza la inserción por la clave foránea

### Requirement: Un único propietario por tarjeta
La base de datos SHALL impedir que una tarjeta tenga más de una fila con
`isOwner` verdadero en `USER_CARD`, mediante un índice único parcial. Las
filas con `isOwner` falso (usuarios con los que se comparte, en la fase 2) no
SHALL estar limitadas por ese índice.

#### Scenario: Segundo propietario
- **WHEN** se intenta insertar una segunda fila con `isOwner = true` para la misma tarjeta
- **THEN** la base de datos rechaza la inserción

#### Scenario: Relación sin propiedad admitida por el esquema
- **WHEN** se inserta directamente en la base de datos una fila con `isOwner = false` para una tarjeta que ya tiene propietario
- **THEN** la base de datos la acepta, porque el esquema ya está preparado para compartir

### Requirement: Un único usuario por tarjeta en la fase 1
El repositorio de tarjetas SHALL crear cada tarjeta junto con exactamente una
fila en `USER_CARD`, la de su propietario con `isOwner = true`, dentro de una
misma transacción. El repositorio NO SHALL ofrecer ninguna operación para
relacionar una tarjeta existente con otro usuario.

#### Scenario: Alta de una tarjeta
- **WHEN** el repositorio crea una tarjeta para el usuario 1
- **THEN** existe una fila en `CARD` y exactamente una fila en `USER_CARD` con `userId = 1` e `isOwner = true`

#### Scenario: Fallo a mitad del alta
- **WHEN** la inserción en `USER_CARD` falla (por ejemplo, porque el propietario no existe)
- **THEN** tampoco queda la fila en `CARD`

### Requirement: Acceso a las tarjetas a través de la relación
Toda lectura de tarjetas del repositorio SHALL hacerse a partir de un usuario
y pasar por `USER_CARD`: listar las tarjetas de un usuario y buscar una
tarjeta concreta de un usuario. Una tarjeta que no esté relacionada con ese
usuario SHALL tratarse igual que una inexistente. Cada tarjeta devuelta SHALL
indicar si el usuario es su propietario.

#### Scenario: Listar las tarjetas propias
- **WHEN** se piden las tarjetas del empleado de prueba
- **THEN** se devuelven solo las tarjetas relacionadas con él, ordenadas por `createdAt` ascendente, cada una con `isOwner = true`

#### Scenario: Buscar la tarjeta de otro usuario
- **WHEN** se busca una tarjeta existente indicando un usuario que no está relacionado con ella
- **THEN** el repositorio no devuelve nada, igual que si la tarjeta no existiera

### Requirement: Modificación y borrado solo por el propietario
El repositorio SHALL ofrecer la modificación de los datos de una tarjeta y su
borrado indicando la tarjeta y el usuario, y SHALL aplicar la operación solo
si existe en `USER_CARD` una relación de ese usuario con esa tarjeta con
`isOwner = true`. Si no existe, no SHALL cambiar nada e indicará que no ha
encontrado la tarjeta. La modificación SHALL actualizar `updatedAt` y
conservar `id` y `createdAt`. El borrado SHALL eliminar la fila de `CARD` y,
en cascada, todas sus filas de `USER_CARD`.

#### Scenario: Modificar la caducidad de una tarjeta propia
- **WHEN** el propietario modifica solo `expiryMonth` y `expiryYear` de su tarjeta
- **THEN** cambian esos campos y `updatedAt`, y `number`, `cvv`, `id` y `createdAt` no cambian

#### Scenario: Modificar una tarjeta sin ser propietario
- **WHEN** se pide modificar o borrar una tarjeta indicando un usuario relacionado con ella con `isOwner = false`, o no relacionado
- **THEN** el repositorio indica que no la ha encontrado y la tarjeta no cambia

#### Scenario: Borrar una tarjeta propia
- **WHEN** el propietario borra su tarjeta
- **THEN** desaparecen la fila de `CARD` y todas sus filas de `USER_CARD`

### Requirement: Borrado de usuarios con tarjetas
Al eliminar un usuario SHALL eliminarse, en la misma transacción, las
tarjetas de las que es propietario, y SHALL eliminarse en cascada todas sus
filas de `USER_CARD`. No SHALL quedar ninguna fila en `CARD` sin propietario.

#### Scenario: Eliminar un usuario con tarjetas
- **WHEN** se elimina un usuario que es propietario de dos tarjetas
- **THEN** desaparecen sus dos tarjetas de `CARD` y sus filas de `USER_CARD`, y las tarjetas de los demás usuarios no cambian

### Requirement: Claves foráneas activas
Cada conexión del servidor a SQLite SHALL activar `PRAGMA foreign_keys = ON`,
tanto en la aplicación como en las migraciones, los seeds y los tests.

#### Scenario: Conexión nueva
- **WHEN** se abre una conexión con la configuración de `knexfile.cjs`
- **THEN** `PRAGMA foreign_keys` devuelve `1`

### Requirement: Datos de prueba
El seed de desarrollo SHALL vaciar `USER_CARD`, `CARD` y `USER` en ese orden y
crear, además de los usuarios de prueba, una tarjeta de prueba propiedad del
empleado de prueba con un número de test que supere la comprobación de Luhn y
no corresponda a ninguna tarjeta real.

#### Scenario: Ejecutar el seed dos veces
- **WHEN** se ejecuta `npm run db:seed --workspace=server` dos veces seguidas
- **THEN** termina sin errores de clave foránea y el empleado de prueba tiene exactamente una tarjeta
