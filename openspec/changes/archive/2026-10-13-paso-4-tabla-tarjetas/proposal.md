# Propuesta: paso 4 — tabla de tarjetas con relación N:N

## Why

La aplicación existe para que cada empleado guarde sus tarjetas, pero todavía
no hay dónde guardarlas: la base de datos solo tiene la tabla `USER`. Antes de
construir el dashboard de tarjetas (`paso-5-dashboard-tarjetas`) hace falta el
modelo de datos. Aunque en la fase 1 una tarjeta pertenece a un único usuario,
la fase 2 exige compartir tarjetas entre usuarios; modelar ya la relación como
N:N evita una migración de datos con tarjetas reales cuando llegue ese momento.

## What Changes

- **Tabla `CARD`** con los datos de la tarjeta: identificador (UUID), número,
  mes y año de caducidad, CVV y fechas de creación y modificación.
- **Tabla de unión `USER_CARD`** (`userId`, `cardId`, `isOwner`) que relaciona
  usuarios y tarjetas como N:N, con claves foráneas a `USER` y `CARD`, borrado
  en cascada y un índice único parcial que garantiza **un solo propietario por
  tarjeta**.
- **Regla de la fase 1**: cada tarjeta tiene exactamente una fila en
  `USER_CARD`, la de su propietario. La regla se aplica en el repositorio (no
  hay ninguna operación para añadir un segundo usuario) y no en el esquema, de
  modo que la fase 2 solo tenga que añadir filas con `isOwner = false`.
- **Repositorio de tarjetas** que siempre accede a las tarjetas **a través de
  la relación** con el usuario: listar las tarjetas de un usuario, buscar una
  tarjeta de un usuario, crear una tarjeta para su propietario (en una
  transacción), modificar y borrar una tarjeta solo si el usuario es su
  propietario, y borrar las tarjetas que posee un usuario.
- **Claves foráneas activas en SQLite** (`PRAGMA foreign_keys = ON` en cada
  conexión), que hoy están desactivadas por defecto.
- **Borrado de usuarios**: al eliminar un usuario se eliminan las tarjetas de
  las que es propietario (afecta al `DELETE` de `paso-3-gestion-usuarios-admin`).
- **Seed** de desarrollo con una tarjeta de prueba (número de test, no real)
  para el empleado de prueba.
- **PROVISIONAL**: los datos se guardan en texto claro, igual que la
  contraseña en los pasos 1–3. La fase 1 (`fase-1-registro-y-cifrado`)
  sustituirá las columnas de datos por un sobre cifrado.
- **Se guarda el CVV**: decisión del proyecto, que se aparta a propósito de
  PCI DSS (que prohíbe almacenarlo). Se actualiza en consecuencia la
  especificación `boveda-tarjetas` de `fase-1-registro-y-cifrado`, que decía
  lo contrario; en la fase 1 el CVV se cifrará como el resto de campos.

**Fuera de alcance:** API HTTP e interfaz (paso 5), alias, titular y notas, compartir tarjetas (fase 2) y cualquier cifrado.

## Capabilities

### New Capabilities

- `almacen-tarjetas`: modelo persistente de las tarjetas y de su relación N:N
  con los usuarios (propietario único en la fase 1), con sus reglas de
  integridad y el acceso a las tarjetas siempre a través de esa relación.

### Modified Capabilities

Ninguna en `openspec/specs/` (`autenticacion` no cambia). La eliminación de
usuarios de `administracion-usuarios` (cambio `paso-3-gestion-usuarios-admin`,
aún sin archivar) pasa a borrar también las tarjetas del usuario; se recoge
como requisito nuevo de `almacen-tarjetas` en lugar de modificar un cambio sin
archivar.

## Impact

- **Servidor (`server/`)**: nueva migración (`CARD`, `USER_CARD` e índices),
  `knexfile.cjs` (activar claves foráneas), nuevo
  `server/src/infrastructure/database/card-repository.js`, función de dominio
  para las tarjetas, seed actualizado (borrado en orden por las claves
  foráneas) y, si el paso 3 ya está implementado, el borrado de usuarios.
- **Pruebas**: tests del repositorio y de la migración sobre la base temporal
  de `server/test/helpers.js`.
- **Dependencias**: ninguna nueva (`node:crypto.randomUUID`).
- **Documentación afectada**:
  - `README.md`: "Estado actual" (paso 4) y "Persistencia con SQLite"
    (tablas `CARD` y `USER_CARD`, claves foráneas, seed con tarjeta de prueba).
  - `docs/primera-memoria/implementacion-y-seguridad.md`: nueva sección
    "Tabla de tarjetas (paso 4)" con el modelo entidad-relación, por qué N:N,
    la regla del propietario único, qué queda en texto claro y el plan para la
    fase 1 y la fase 2; actualizar "Estructura del proyecto" y "Trabajo futuro".
  - `docs/primera-memoria/manual-de-usuario.md`: sin cambios en este paso (no
    hay interfaz nueva); lo actualiza el paso 5.
