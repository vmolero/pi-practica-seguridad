# Tarjetas de empresa

Práctica de la asignatura Protección de la Información: una aplicación web SaaS para que los empleados de una empresa guarden sus tarjetas de forma segura.

Es una única base de código JavaScript con un cliente Vite + React y una API Express, gestionados desde la raíz del proyecto mediante npm workspaces.

## Estado actual

- **Cliente:** solo incluye la vista de login, con los textos en español. El login llama al servidor real.
- **Servidor:** Express con SQLite, organizado por capas en `server/src/`. Expone `POST /api/public/login`, un endpoint de salud y un recurso de notas de demostración que el cliente ya no usa.
- **Seguridad:** ninguna todavía, a propósito. En el paso 1 la contraseña **viaja y se guarda en texto claro**. Los pasos siguientes añadirán la criptografía.
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

## Vista de login

La vista de login es un formulario con email y contraseña. El usuario se identifica con su email. Las llamadas de autenticación están encapsuladas en `client/src/api/auth.js`: `login({ email, password })` llama a `POST /api/public/login` y `logout()` solo borra el estado del cliente, porque todavía no hay sesión en el servidor.

El seed crea dos usuarios de prueba para desarrollo:

| Email | Contraseña | Rol |
| --- | --- | --- |
| `empleado@empresa.com` | `demo1234` | Empleado |
| `admin@empresa.com` | `admin1234` | Administrador |

Con credenciales incorrectas, la vista muestra el error genérico `Email o contraseña incorrectos.`; si el servidor no responde, `No se ha podido iniciar sesión. Inténtalo de nuevo.`. Tras iniciar sesión se muestra el email del usuario y un botón para cerrar sesión. La sesión solo se guarda en memoria, así que al recargar la página vuelve a aparecer el login.

El comportamiento de la pantalla se describe en el [manual de usuario](docs/primera-memoria/manual-de-usuario.md), y sus medidas de seguridad en [implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md).

## API

La API del servidor incluye:

- `POST /api/public/login`: comprueba un email y una contraseña. Envía `{ "email": "...", "password": "..." }`. Responde `200` con `{ "email", "name", "isAdmin" }`, `401` con `{ "error": "Credenciales inválidas" }` (tanto si el email no existe como si la contraseña no coincide) o `400` si la petición está mal formada. **La contraseña se compara en texto claro.**
- `GET /api/health`: comprueba que el servidor responde.

`/api/public` agrupa los endpoints que no requieren sesión.

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
- [`openspec/changes/archive/2026-10-13-paso-1-login-texto-claro/`](openspec/changes/archive/2026-10-13-paso-1-login-texto-claro/): paso 1, ya implementado y archivado. Login de extremo a extremo en texto claro, con la arquitectura por capas del servidor y la sección pública de la API. Es la base de los pasos siguientes.
- [`openspec/changes/fase-1-registro-y-cifrado/`](openspec/changes/fase-1-registro-y-cifrado/): propuesta, diseño, especificaciones y tareas de la fase 1, con el registro por invitación, el login sin enviar la contraseña, el doble factor y la bóveda de tarjetas cifrada en el navegador. Cada tarea indica si la implementa el equipo (capa de seguridad) o Claude (resto del sistema).
- [`docs/plan-backend-login.md`](docs/plan-backend-login.md): plan anterior del servidor de login, basado en el contrato `POST /api/login` con `{ "email", "password" }`.

El paso 1 implementa el login con el contrato `POST /api/public/login`. La propuesta de la fase 1 lo sustituirá por un login en varios pasos en el que la contraseña nunca sale del navegador; antes de aplicarla hay que dividirla en pasos pequeños que partan de lo que deja el paso 1.

## Documentación

La primera memoria de la práctica está en [`docs/primera-memoria/`](docs/primera-memoria/):

- [Stack tecnológico](docs/primera-memoria/stack-tecnologico.md)
- [Manual de usuario](docs/primera-memoria/manual-de-usuario.md)
- [Implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md)
