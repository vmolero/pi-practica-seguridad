# Cliente y servidor en JavaScript

Una única base de código JavaScript con un cliente Vite y una API Express, gestionados desde la raíz del proyecto mediante npm workspaces.

## Requisitos

- Node.js 20 o posterior
- npm

## Desarrollo

```sh
npm install
npm run dev
```

Abre el cliente en <http://localhost:5173>. El cliente envía las solicitudes a la API mediante el proxy de Vite; el servidor escucha en <http://localhost:3000>.

## Comandos disponibles

```sh
npm run build        # Compila el cliente
npm run start:server # Inicia solo el servidor
```

## API

La API incluye `GET /api/health` y un recurso de notas persistido en SQLite:

- `GET /api/notes`: devuelve las notas guardadas.
- `POST /api/notes`: crea una nota. Envía un cuerpo JSON como `{ "content": "Primera nota" }`.
- `DELETE /api/notes/:id`: elimina una nota por su ID.

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
