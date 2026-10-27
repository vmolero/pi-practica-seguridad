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

En desarrollo, Vite sirve el cliente por HTTPS en `https://localhost:5173` y
redirige las peticiones a `/api` hacia el servidor (`https://localhost:3000`)
mediante su proxy, que verifica el certificado del servidor.

## Backend

El servidor usa **Node.js** (JavaScript) con:

- **Express**: framework HTTP para exponer la API REST bajo `/api`.
- **Knex**: constructor de consultas SQL y gestor de migraciones del esquema.
- **SQLite** como base de datos, a través del controlador **better-sqlite3**.
  Los datos se guardan en el archivo `server/data/app.sqlite`.

## Cifrado del canal

Cliente y servidor solo atienden por **HTTPS** (`node:https` en el servidor y
la opción `server.https` de Vite en el cliente). Cada uno tiene su propio
certificado X.509 autofirmado, que se genera con **OpenSSL** mediante
`npm run cert` (`scripts/generar-certificados.mjs`). OpenSSL es, por tanto,
una herramienta necesaria para poner en marcha el proyecto. El proceso se
describe en [certificados autofirmados](certificados-autofirmados.md).

## Librerías utilizadas

### Librerías criptográficas

**Pendiente de decidir.** Todavía no se ha elegido qué librerías se usarán para
el almacenamiento seguro de contraseñas ni para el cifrado de los datos de las
tarjetas. Esta sección se completará cuando se tome la decisión.
