# Tarjetas de empresa

Práctica de la asignatura Protección de la Información: una aplicación web SaaS para que los empleados de una empresa guarden sus tarjetas de forma segura.

Es una única base de código JavaScript con un cliente Vite + React y una API Express, gestionados desde la raíz del proyecto mediante npm workspaces.

## Estado actual

- **Cliente:** vista de login y vista de sesión, con los textos en español. El login llama al servidor real y la vista de sesión consulta la sección privada de la API con el token de sesión.
- **Servidor:** Express con SQLite, organizado por capas en `server/src/`. Expone una sección pública (`POST /api/public/login`), una sección privada protegida por un middleware de autenticación con JWT (`GET /api/private/me`), un endpoint de salud y un recurso de notas de demostración que el cliente ya no usa.
- **Seguridad:** casi ninguna todavía, a propósito. La contraseña **viaja y se guarda en texto claro**, y el token se firma con un secreto HMAC **provisional** hasta que el equipo entregue la firma asimétrica. Los pasos siguientes añadirán la criptografía.
- **Planificación:** el trabajo se divide en pasos pequeños propuestos como cambios de OpenSpec. Consulta la sección [Planificación](#planificación).

## Estructura

```text
.
├── client/          # Frontend: Vite + React (JavaScript, sin TypeScript)
├── server/          # Backend: Node.js + Express + Knex + SQLite (better-sqlite3)
├── docs/            # Memoria de la práctica y planes de diseño
└── openspec/        # Propuestas de cambio y especificaciones (OpenSpec)
```

## Requisitos

- Node.js 20 o posterior
- npm

## Desarrollo

```sh
npm install
npm run db:migrate --workspace=server
npm run db:seed --workspace=server
npm run dev
```

`npm run dev` arranca a la vez el cliente y el servidor. Abre el cliente en <http://localhost:5173>. El cliente envía las solicitudes a la API mediante el proxy de Vite; el servidor escucha en <http://localhost:3000>.

## Comandos disponibles

```sh
npm run dev          # Inicia el cliente y el servidor en modo desarrollo
npm run build        # Compila el cliente en client/dist/
npm run start:server # Inicia solo el servidor
npm test --workspace=server  # Ejecuta los tests del servidor (node:test)
```

### Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del servidor |
| `JWT_SECRET` | aleatorio por proceso | Secreto **provisional** para firmar los tokens. Mínimo 32 caracteres |
| `JWT_TTL_SECONDS` | `3600` | Tiempo de vida del token de sesión, en segundos |

Si `JWT_SECRET` no está definido, el servidor genera un secreto aleatorio y lo avisa en la consola. Entonces los tokens dejan de valer cada vez que el servidor se reinicia, también cuando `npm run dev` lo recarga tras un cambio de código: habrá que volver a iniciar sesión. Para no perder la sesión al desarrollar, define un secreto propio. Para probar la caducidad, usa un tiempo de vida corto:

```sh
JWT_SECRET=un-secreto-de-desarrollo-de-al-menos-32-caracteres JWT_TTL_SECONDS=10 npm run dev
```

## Vista de login

La vista de login es un formulario con email y contraseña. El usuario se identifica con su email. Las llamadas de autenticación están encapsuladas en `client/src/api/auth.js`:

- `login({ email, password })` llama a `POST /api/public/login` y guarda el token de sesión **solo en memoria** (`client/src/api/session.js`).
- `getCurrentUser()` llama a `GET /api/private/me` con el token mediante `apiFetch` (`client/src/api/http.js`), que añade la cabecera `Authorization: Bearer <token>`.
- `logout()` descarta el token. No hay nada que cerrar en el servidor.

El seed crea dos usuarios de prueba para desarrollo:

| Email | Contraseña | Rol |
| --- | --- | --- |
| `empleado@empresa.com` | `demo1234` | Empleado |
| `admin@empresa.com` | `admin1234` | Administrador |

Con credenciales incorrectas, la vista muestra el error genérico `Email o contraseña incorrectos.`; si el servidor no responde, `No se ha podido iniciar sesión. Inténtalo de nuevo.`. Tras iniciar sesión se muestran el nombre y el email que devuelve `GET /api/private/me`, y un botón para cerrar sesión. La vista vuelve a consultar `/me` cada vez que la ventana recupera el foco. Si el token ha caducado o no es válido, vuelve al login con el aviso `Tu sesión ha caducado. Vuelve a iniciar sesión.`. El token solo se guarda en memoria, así que al recargar la página vuelve a aparecer el login.

El comportamiento de la pantalla se describe en el [manual de usuario](docs/primera-memoria/manual-de-usuario.md), y sus medidas de seguridad en [implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md).

## API

La API del servidor incluye:

- `POST /api/public/login`: comprueba un email y una contraseña. Envía `{ "email": "...", "password": "..." }`. Responde `200` con `{ "token", "user": { "email", "name", "isAdmin" } }`, donde `token` es el JWT de sesión, `401` con `{ "error": "Credenciales inválidas" }` (tanto si el email no existe como si la contraseña no coincide) o `400` si la petición está mal formada. **La contraseña se compara en texto claro.**
- `GET /api/private/me`: devuelve `{ "email", "name", "isAdmin" }` del usuario del token. Requiere `Authorization: Bearer <token>`.
- `GET /api/health`: comprueba que el servidor responde.

`/api/public` agrupa los endpoints que no requieren sesión. Todo lo que hay bajo `/api/private` pasa antes por el middleware de autenticación, que verifica la firma, el emisor y la caducidad del token y deja el usuario y su rol en `request.user`. Ante cualquier fallo responde `401` con `{ "error": "No autenticado" }` y la cabecera `WWW-Authenticate: Bearer`, sin indicar la causa.

Ejemplo con `curl` (con el servidor en marcha y el seed aplicado):

```sh
# 1. Inicia sesión y guarda el token
TOKEN=$(curl -s -X POST http://localhost:3000/api/public/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"empleado@empresa.com","password":"demo1234"}' \
  | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).token))')

# 2. Consulta la sección privada con el token → 200
curl -s http://localhost:3000/api/private/me -H "Authorization: Bearer $TOKEN"

# 3. Sin token → 401 {"error":"No autenticado"}
curl -s -i http://localhost:3000/api/private/me
```

El servidor sigue una arquitectura por capas (dominio, aplicación e infraestructura) descrita en [implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md).

## Persistencia con SQLite

La base de datos es el archivo `server/data/app.sqlite`, gestionado con Knex. El directorio `server/data/` se crea automáticamente cuando hace falta. El archivo de la base de datos está excluido de Git para no subir los datos locales.

La tabla `USER` se administra mediante migraciones de Knex. El historial de migraciones también se guarda en esta base de datos, en las tablas `knex_migrations` y `knex_migrations_lock`.

Iniciar el servidor no ejecuta automáticamente las migraciones pendientes; aplícalas con el comando `db:migrate`.

## Migraciones de base de datos

Ejecuta estos comandos desde la raíz del proyecto:

```sh
# Genera una migración con marca de tiempo
npm run db:make --workspace=server -- add_table_name

# Aplica todas las migraciones pendientes
npm run db:migrate --workspace=server

# Revierte el último lote de migraciones aplicado
npm run db:rollback --workspace=server

# Borra los usuarios y crea los usuarios de prueba
npm run db:seed --workspace=server
```

`db:make` crea un archivo CommonJS en `server/migrations/`. Define el cambio de esquema en `up` y su reversión en `down`. Knex registra cada migración aplicada y no la vuelve a ejecutar.

La primera migración crea la tabla `USER` con `name`, `email` e `isAdmin` (booleano, `false` por defecto). La segunda añade la clave primaria `id`, la columna `password` (en texto claro en este paso) y hace único el `email`, que se guarda siempre en minúsculas. El seed está en `server/seeds/` y solo debe usarse en desarrollo. Para cambios posteriores, crea una migración nueva en vez de modificar una que ya se haya aplicado.

## Planificación

El proyecto usa [OpenSpec](https://github.com/Fission-AI/OpenSpec) (instalado como dependencia de desarrollo) para proponer y seguir los cambios. Los comandos `/opsx:*` de Claude Code y las skills de `.claude/` trabajan sobre la carpeta `openspec/`.

- [`openspec/specs/autenticacion/`](openspec/specs/autenticacion/spec.md): especificación vigente del login.
- [`openspec/changes/paso-2-middleware-jwt/`](openspec/changes/paso-2-middleware-jwt/): paso 2, sesión con JWT y middleware de autenticación. Está implementado salvo la firma asimétrica definitiva, que corresponde al equipo (ver [`server/src/infrastructure/security/README.md`](server/src/infrastructure/security/README.md)).
- [`openspec/changes/archive/2026-10-13-paso-1-login-texto-claro/`](openspec/changes/archive/2026-10-13-paso-1-login-texto-claro/): paso 1, ya implementado y archivado. Login de extremo a extremo en texto claro, con la arquitectura por capas del servidor y la sección pública de la API. Es la base de los pasos siguientes.
- [`openspec/changes/fase-1-registro-y-cifrado/`](openspec/changes/fase-1-registro-y-cifrado/): propuesta, diseño, especificaciones y tareas de la fase 1, con el registro por invitación, el login sin enviar la contraseña, el doble factor y la bóveda de tarjetas cifrada en el navegador. Cada tarea indica si la implementa el equipo (capa de seguridad) o Claude (resto del sistema).
- [`docs/plan-backend-login.md`](docs/plan-backend-login.md): plan anterior del servidor de login, basado en el contrato `POST /api/login` con `{ "email", "password" }`.

El paso 1 implementa el login con el contrato `POST /api/public/login`. La propuesta de la fase 1 lo sustituirá por un login en varios pasos en el que la contraseña nunca sale del navegador; antes de aplicarla hay que dividirla en pasos pequeños que partan de lo que deja el paso 1.

## Documentación

La primera memoria de la práctica está en [`docs/primera-memoria/`](docs/primera-memoria/):

- [Stack tecnológico](docs/primera-memoria/stack-tecnologico.md)
- [Manual de usuario](docs/primera-memoria/manual-de-usuario.md)
- [Implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md)
