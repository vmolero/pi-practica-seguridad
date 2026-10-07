# Tarjetas de empresa

Práctica de la asignatura Protección de la Información: una aplicación web SaaS para que los empleados de una empresa guarden sus tarjetas de forma segura.

Es una única base de código JavaScript con un cliente Vite + React y una API Express, gestionados desde la raíz del proyecto mediante npm workspaces.

## Estado actual

- **Cliente:** solo incluye la vista de login, con los textos en español. El inicio de sesión está **simulado**: todavía no hay backend de autenticación.
- **Servidor:** Express con SQLite. Expone un endpoint de salud y un recurso de notas de demostración que el cliente ya no usa. La tabla `USER` existe, pero todavía no tiene contraseña ni material criptográfico.
- **Planificación:** la siguiente fase (registro, autenticación y bóveda cifrada de tarjetas) está propuesta como un cambio de OpenSpec. Consulta la sección [Planificación](#planificación).

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
npm run dev
```

`npm run dev` arranca a la vez el cliente y el servidor. Abre el cliente en <http://localhost:5173>. El cliente envía las solicitudes a la API mediante el proxy de Vite; el servidor escucha en <http://localhost:3000>.

## Comandos disponibles

```sh
npm run dev          # Inicia el cliente y el servidor en modo desarrollo
npm run build        # Compila el cliente en client/dist/
npm run start:server # Inicia solo el servidor
```

## Vista de login

La vista de login es un formulario con email y contraseña. El usuario se identifica con su email. Las llamadas de autenticación están encapsuladas en `client/src/api/auth.js`, cuyas funciones `login({ email, password })` y `logout()` están simuladas.

Para probar la simulación, abre <http://localhost:5173> e inicia sesión con:

- Email: `empleado@empresa.com`
- Contraseña: `demo1234`

Estas credenciales **solo existen en la simulación** y desaparecerán cuando se conecte el backend real. Con cualquier otra combinación, la vista muestra el error genérico `Email o contraseña incorrectos.`. Tras iniciar sesión se muestra el email del usuario y un botón para cerrar sesión. La sesión solo se guarda en memoria, así que al recargar la página vuelve a aparecer el login.

El comportamiento de la pantalla se describe en el [manual de usuario](docs/primera-memoria/manual-de-usuario.md), y sus medidas de seguridad en [implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md).

## API

La API del servidor incluye:

- `GET /api/health`: comprueba que el servidor responde.
- `GET /api/notes`: devuelve las notas guardadas.
- `POST /api/notes`: crea una nota. Envía un cuerpo JSON como `{ "content": "Primera nota" }`.
- `DELETE /api/notes/:id`: elimina una nota por su ID.

El recurso `notes` es de demostración; la propuesta de la fase 1 prevé eliminarlo. Todavía no existe ningún endpoint de autenticación.

## Persistencia con SQLite

El servidor y Knex usan el mismo archivo de base de datos: `server/data/app.sqlite`. El directorio `server/data/` se crea automáticamente cuando hace falta. El archivo de la base de datos está excluido de Git para no subir los datos locales.

Al iniciar el servidor, `server/database.js` crea la tabla `notes` si todavía no existe. La tabla `USER` se administra mediante migraciones de Knex. El historial de migraciones también se guarda en esta base de datos, en las tablas `knex_migrations` y `knex_migrations_lock`.

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
```

`db:make` crea un archivo CommonJS en `server/migrations/`. Define el cambio de esquema en `up` y su reversión en `down`. Knex registra cada migración aplicada y no la vuelve a ejecutar.

La primera migración crea la tabla `USER` con las columnas obligatorias `name` y `email`, y la columna booleana obligatoria `isAdmin`, cuyo valor predeterminado es `false`. Para cambios posteriores, crea una migración nueva en vez de modificar una que ya se haya aplicado.

## Planificación

El proyecto usa [OpenSpec](https://github.com/Fission-AI/OpenSpec) (instalado como dependencia de desarrollo) para proponer y seguir los cambios. Los comandos `/opsx:*` de Claude Code y las skills de `.claude/` trabajan sobre la carpeta `openspec/`.

- [`openspec/changes/fase-1-registro-y-cifrado/`](openspec/changes/fase-1-registro-y-cifrado/): propuesta, diseño, especificaciones y tareas de la fase 1, con el registro por invitación, el login sin enviar la contraseña, el doble factor y la bóveda de tarjetas cifrada en el navegador. Cada tarea indica si la implementa el equipo (capa de seguridad) o Claude (resto del sistema).
- [`docs/plan-backend-login.md`](docs/plan-backend-login.md): plan anterior del servidor de login, basado en el contrato `POST /api/login` con `{ "email", "password" }`.

La propuesta de la fase 1 sustituye ese contrato por un login en varios pasos en el que la contraseña nunca sale del navegador. Cuando se aplique, habrá que reescribir `client/src/api/auth.js` y actualizar este README y la memoria.

## Documentación

La primera memoria de la práctica está en [`docs/primera-memoria/`](docs/primera-memoria/):

- [Stack tecnológico](docs/primera-memoria/stack-tecnologico.md)
- [Manual de usuario](docs/primera-memoria/manual-de-usuario.md)
- [Implementación y seguridad](docs/primera-memoria/implementacion-y-seguridad.md)
