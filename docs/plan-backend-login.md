# Plan pi-back: servidor de login (siguiente iteración)

## Contexto

La práctica es un SaaS donde los empleados de una empresa guardan tarjetas. En esta iteración
el front (pi-front) hace solo la vista de login contra `client/src/api/auth.js`, hoy simulado.
Este documento describe la estructura de la parte de servidor que hará real ese contrato en la
**siguiente** iteración. Las decisiones de seguridad (algoritmos, parámetros, mecanismos de
protección) **no se incluyen aquí**: las toma el equipo y se documentarán aparte.

Estado actual del servidor:

- `server/index.js`: Express 5, `express.json()`, `x-powered-by` desactivado, rutas `/api/health` y `/api/notes`.
- `server/database.js`: abre `server/data/app.sqlite` con `better-sqlite3` (WAL), crea `notes` y expone funciones con sentencias preparadas. No exporta la instancia `database`.
- `server/knexfile.cjs` + `server/migrations/20260929154731_create_user_table.cjs`: tabla `USER(name, email, isAdmin)`. No tiene `id`, ni clave primaria, ni índice en `email`, ni contraseña.
- `server/package.json`: `express ^5`, `better-sqlite3 ^12`, `knex ^3`. Scripts `db:make`, `db:migrate`, `db:rollback`. Node ≥ 20.
- `client/vite.config.js`: proxy `/api` → `http://localhost:3000` (mismo origen desde el navegador en desarrollo).
- `.gitignore` ya excluye `.env` y `server/data/*.sqlite*`.

Contrato acordado con pi-front:

- `POST /api/login` JSON `{"email","password"}` → `200` + sesión; `401 {"error":"Credenciales inválidas"}`.
- Se añaden `POST /api/logout` y `GET /api/me`.

---

## 1. Migración Knex: `id`, índice único en `email` y columna para la contraseña

**Archivo nuevo:** `server/migrations/<timestamp>_add_auth_to_user.cjs`
(generar con `npm run db:make --workspace=server -- add_auth_to_user`).

**Restricción técnica:** SQLite no permite `ALTER TABLE ... ADD COLUMN` con `PRIMARY KEY`; Knex
generaría exactamente eso con `table.increments('id')` dentro de `alterTable` y fallaría. Hay que
**recrear la tabla** (crear `USER_new`, copiar filas, borrar `USER`, renombrar).

**Esquema objetivo de `USER`:**

| Columna         | Tipo                                | Notas                                                  |
|-----------------|-------------------------------------|--------------------------------------------------------|
| `id`            | `INTEGER PRIMARY KEY AUTOINCREMENT` | `table.increments('id')`                               |
| `name`          | `string(100) NOT NULL`              | se conserva                                            |
| `email`         | `string(254) NOT NULL UNIQUE`       | guardado normalizado (trim + minúsculas)               |
| `password_hash` | `string(255) NULL`                  | formato y algoritmo: a decidir por el equipo           |
| `isAdmin`       | `boolean NOT NULL DEFAULT false`    | se conserva                                            |
| `created_at`    | `timestamp NOT NULL DEFAULT now`    | `table.timestamp('created_at').defaultTo(knex.fn.now())` |

`password_hash` nullable: `NULL` significa "cuenta sin contraseña, no puede iniciar sesión".
Permite conservar las filas existentes y encaja con el manual (el gestor crea empleados y la
contraseña se fija después).

```js
exports.up = async function (knex) {
  await knex.schema.createTable('USER_new', (table) => {
    table.increments('id');
    table.string('name', 100).notNullable();
    table.string('email', 254).notNullable().unique();
    table.string('password_hash', 255).nullable();
    table.boolean('isAdmin').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    INSERT INTO USER_new (name, email, isAdmin)
    SELECT name, lower(trim(email)), isAdmin FROM USER
  `);
  await knex.schema.dropTable('USER');
  await knex.schema.renameTable('USER_new', 'USER');
};
```

`down`: recrea la tabla original `(name, email, isAdmin)` copiando esas columnas.

---

## 2. Endpoints

Nuevo módulo `server/auth.js` (router + middleware) importado desde `server/index.js`.

### `POST /api/login`

1. Validar el cuerpo: `email` y `password` deben ser cadenas con longitud acotada. Si no, `400 {"error":"Petición inválida"}`.
2. Normalizar `email` (trim, minúsculas).
3. Buscar el usuario por email (`findUserByEmail` en `database.js`).
4. Verificar la contraseña contra `password_hash` (mecanismo a decidir por el equipo).
5. Si falla por cualquier motivo → `401 {"error":"Credenciales inválidas"}`.
6. Si va bien: establecer la sesión y responder `200 {"id","name","email","isAdmin"}` (mismo cuerpo que `/api/me`, para que el front no necesite una segunda llamada).

### `POST /api/logout`

Cierra la sesión y responde `204`. Responde `204` también sin sesión (idempotente).

### `GET /api/me`

Middleware `requireAuth`: sin sesión válida → `401 {"error":"No autenticado"}`. Con sesión,
`getUserById` y devolver `{"id","name","email","isAdmin"}`. Si el usuario ya no existe en BD,
cerrar la sesión y `401`.

### Comportamiento general de la API

- Rutas `/api/*` desconocidas → `404 {"error":"No encontrado"}` en JSON.
- Manejador de errores final → `500 {"error":"Error interno"}`; el detalle solo en el log del servidor.
- `express.json` con un límite de tamaño de cuerpo.

---

## 3. Archivos a tocar en la implementación

| Archivo | Cambio |
|---------|--------|
| `server/migrations/<ts>_add_auth_to_user.cjs` | **nuevo**, sección 1 |
| `server/database.js` | exportar `database`; añadir `findUserByEmail(email)`, `getUserById(id)`, `createUser({name,email,passwordHash,isAdmin})`, `updatePasswordHash(id, hash)`. `getUserById` no devuelve el hash. |
| `server/auth.js` | **nuevo**: `normalizeEmail`, `requireAuth`, `authRouter` con las tres rutas, y los mecanismos de seguridad que decida el equipo |
| `server/index.js` | registrar middleware de sesión y seguridad, `app.use('/api', authRouter)`, 404 JSON, manejador de errores |
| `server/scripts/create-user.js` | **nuevo**: alta de usuarios por línea de comandos (`<email> <name> [--admin]`, contraseña por `stdin`). Única forma de alta en esta iteración. |
| `server/package.json` | dependencias nuevas; scripts `dev`/`start` con `--env-file=.env` (Node 20, sin `dotenv`); `user:create`; `test` |
| `server/.env.example` | **nuevo**: variables de entorno necesarias (`PORT`, `NODE_ENV` y las que requiera la sesión) |
| `client/src/api/auth.js` | **ámbito pi-front**: sustituir la simulación por `fetch('/api/login', …)` con `credentials: 'same-origin'`. No se toca desde pi-back. |
| `README.md`, `docs/` | **ámbito pi-docs**: documentar migración, `.env`, `user:create` y los tres endpoints. |

Orden de implementación: migración → `database.js` → `auth.js` → `index.js` → script de alta →
`.env.example` → pruebas.

---

## 4. Decisiones de seguridad pendientes (las toma el equipo)

Lista de temas que la implementación debe resolver. Aquí solo se enumeran; no se propone solución.

1. **Almacenamiento de contraseñas:** algoritmo de hash, parámetros de coste, gestión de la sal y política de longitud/complejidad de contraseña.
2. **Sesión:** cookie de sesión en servidor frente a token (JWT u otro); atributos de la cookie (`HttpOnly`, `Secure`, `SameSite`), duración, caducidad deslizante o absoluta, dónde se guardan las sesiones, y qué ocurre con el identificador de sesión al iniciar y cerrar sesión.
3. **Fuerza bruta:** limitación de intentos sobre `POST /api/login` (por IP, por cuenta o ambas), umbrales, respuesta al cliente y riesgo de bloqueo de cuentas ajenas.
4. **Mensajes de error y enumeración de usuarios:** garantizar que email inexistente, contraseña incorrecta y cuenta sin contraseña se comporten igual, tanto en el cuerpo de la respuesta como en el tiempo de respuesta.
5. **CSRF:** qué protección se aplica a las peticiones que modifican estado y cómo se comprueba el origen de la petición.
6. **Cabeceras de seguridad:** qué cabeceras HTTP se devuelven (CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS, etc.) y con qué valores, teniendo en cuenta que en desarrollo Vite sirve el HTML y la API solo responde JSON.
7. **Secretos y configuración:** qué secretos hacen falta, cómo se generan y cómo llegan al proceso (`.env`).
8. **Despliegue:** HTTPS directo o proxy inverso, y su efecto en `trust proxy` y en los atributos de la cookie.
9. **Registro (logs):** qué se registra en cada intento de login y qué nunca debe registrarse.

---

## 5. Verificación funcional

```sh
npm run db:migrate --workspace=server
sqlite3 server/data/app.sqlite '.schema USER'          # id, email UNIQUE, password_hash
npm run user:create --workspace=server -- ana@empresa.es "Ana" --admin
npm run dev
```

```sh
# login correcto: 200 + cookie de sesión
curl -i -c jar.txt -H 'Content-Type: application/json' -d '{"email":"Ana@Empresa.es ","password":"..."}' http://localhost:3000/api/login
# email inexistente y contraseña errónea: ambos 401 {"error":"Credenciales inválidas"}
# /api/me con cookie: 200 con usuario; sin cookie: 401
curl -i -b jar.txt http://localhost:3000/api/me
# logout: 204; después /api/me → 401
curl -i -b jar.txt -X POST http://localhost:3000/api/logout
```

Pruebas automáticas (`server/test/auth.test.js`, `node --test` + `supertest`) sobre una SQLite
temporal: 200/401, cookie de sesión presente, `me` tras logout → 401. Comprobar también desde el
navegador en `http://localhost:5173` que la cookie llega a través del proxy de Vite y que el
refresco de página mantiene la sesión (`GET /api/me`). Las comprobaciones de los mecanismos de
seguridad se añadirán cuando el equipo los decida.

---

## Preguntas abiertas para el usuario

1. **Filas actuales de `USER`:** ¿conservarlas con `password_hash = NULL` (recrear-copiar) o vaciar la tabla al migrar?
2. **Alta de usuarios:** ¿basta el script CLI `user:create` en esta iteración, o se quiere ya un `POST /api/users` protegido para el rol gestor?
3. **Cuerpo de `POST /api/login` en 200:** se propone devolver `{id, name, email, isAdmin}`; confirmar con pi-front que no espera cuerpo vacío.
4. **Códigos adicionales:** si se añade limitación de intentos, ¿pi-front mostrará un mensaje propio para `429` o reutiliza el genérico?
5. **Servir `client/dist` desde Express en producción:** ¿se asume un único origen?
6. **Nombres de columna:** `isAdmin` queda en camelCase y `password_hash`/`created_at` en snake_case. ¿Unificar ahora aprovechando que se recrea la tabla?
7. **Pruebas:** ¿`node:test` + `supertest` es aceptable, o se prefiere alinear con lo que use pi-front (p. ej. Vitest)?
