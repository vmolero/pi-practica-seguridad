# Stack tecnológico

El sistema de almacenamiento de tarjetas será una aplicación web que se ofrece
a los empleados de una empresa como servicio (SaaS).

El proyecto es una única base de código JavaScript organizada con npm
workspaces: `client/` (frontend) y `server/` (backend), gestionados desde la
raíz.

## Frontend

El frontend usa **React** como librería de interfaz de usuario y **Vite** como
herramienta de desarrollo y empaquetado. Está escrito en **JavaScript** (sin
TypeScript).

En desarrollo, Vite sirve el cliente en `http://localhost:5173` y redirige las
peticiones a `/api` hacia el servidor mediante su proxy.

## Backend

El servidor usa **Node.js** (JavaScript) con:

- **Express**: framework HTTP para exponer la API REST bajo `/api`.
- **Knex**: constructor de consultas SQL y gestor de migraciones del esquema.
- **SQLite** como base de datos, a través del controlador **better-sqlite3**.
  Los datos se guardan en el archivo `server/data/app.sqlite`.

## Librerías utilizadas

### Librerías criptográficas

**Pendiente de decidir.** Todavía no se ha elegido qué librerías se usarán para
el almacenamiento seguro de contraseñas ni para el cifrado de los datos de las
tarjetas. Esta sección se completará cuando se tome la decisión.
