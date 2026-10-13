# Propuesta: paso 1 — login en texto claro

## Why

El cambio `fase-1-registro-y-cifrado` es demasiado grande para abordarlo de una
vez. Antes de añadir criptografía hace falta un login de extremo a extremo que
funcione, con la arquitectura por capas del servidor ya montada, para que las
fases siguientes solo sustituyan piezas concretas. Hoy la pantalla de login
está simulada en el cliente y la tabla `USER` no guarda la contraseña.

## What Changes

- **Sección pública de la API**: se crea un prefijo `/api/public` para los
  endpoints que no requieren sesión. El primero es `POST /api/public/login`.
- **Login en texto claro**: el cliente envía `{ "email", "password" }` sin
  cifrar. El servidor valida la forma de la petición, busca al usuario por
  email y compara la contraseña campo a campo. Si coinciden, responde con el
  email, el nombre y el rol del usuario; si no, con un error genérico.
- **Arquitectura por capas en el servidor**: infraestructura (HTTP, validación
  de la petición y repositorio sobre la base de datos), aplicación (servicio de
  autenticación) y dominio (usuario).
- **Contraseña en la tabla `USER`**: una migración añade la columna `password`
  (en claro) y hace único el email. Un *seed* crea usuarios de prueba, uno de
  ellos administrador.
- **Cliente**: `client/src/api/auth.js` deja de simular y llama al endpoint
  real. La sesión sigue guardándose solo en memoria del navegador.
- **Sin seguridad, a propósito**: no hay HTTPS, hash, sal, sesión en servidor ni
  límite de intentos. Este paso existe para tener la base funcional; la
  seguridad llega en pasos posteriores.

Fuera de alcance: sesión en el servidor (cookie o token), cierre de sesión en el
servidor, registro de usuarios, rutas privadas y retirada del recurso `notes`.

## Capabilities

### New Capabilities

- `autenticacion`: cómo un usuario se identifica ante el sistema con su email y
  su contraseña, y qué responde el servidor en cada caso.

### Modified Capabilities

Ninguna: todavía no hay especificaciones principales en `openspec/specs/`.

## Impact

- **Servidor**: nueva estructura `server/src/` por capas, nueva migración y
  *seed* de Knex, nuevo endpoint `POST /api/public/login`. `server/index.js`
  monta el nuevo router; el recurso `notes` no cambia.
- **Cliente**: `client/src/api/auth.js` pasa de la simulación a `fetch`.
- **Base de datos**: la tabla `USER` gana `password` y un índice único en
  `email`. Hay que ejecutar `db:migrate` y `db:seed`.
- **Relación con `fase-1-registro-y-cifrado`**: aquella propuesta define otro
  contrato de login (en varios pasos, sin enviar la contraseña). Este paso no la
  modifica; cuando se retome, habrá que reescribirla como una evolución de lo
  que este paso deja en `autenticacion`.
- **Memoria**: la contraseña viaja y se guarda en claro. La documentación debe
  decirlo explícitamente para que nadie lo tome por el diseño final.
