# Diseño: paso 1 — login en texto claro

## Context

- El servidor es un único `server/index.js` con Express 5. El recurso `notes`
  accede a SQLite con better-sqlite3 directamente (`server/database.js`).
- La tabla `USER` la crea una migración de Knex con `name`, `email` e
  `isAdmin`. No tiene clave primaria, contraseña ni índice en `email`.
- El cliente ya tiene la pantalla de login. `client/src/api/auth.js` simula la
  llamada y `LoginForm.jsx` muestra el mismo error para cualquier fallo.
- Vite redirige `/api` al servidor (`localhost:3000`), así que no hace falta CORS.
- Los requisitos están en `specs/autenticacion/spec.md`.

## Goals / Non-Goals

**Goals:**

- Dejar montada en el servidor una arquitectura por capas que los pasos
  siguientes puedan ampliar sin reorganizar el código.
- Que cada capa se pueda probar por separado: el servicio sin HTTP y el
  endpoint sin levantar el puerto.

**Non-Goals:**

- Cualquier medida de seguridad: hash, sal, HTTPS, sesión, límite de intentos.
- Migrar el recurso `notes` a la nueva estructura (se retirará más adelante).
- Gestión de usuarios desde la interfaz o la API.

## Decisions

### 1. Estructura por capas en `server/src/`

```text
server/
├── index.js                          # Arranque: crea la app y escucha el puerto
└── src/
    ├── app.js                        # createApp({ authService }): monta middleware y routers
    ├── domain/
    │   └── user.js                   # Forma del usuario y toPublicUser(user)
    ├── application/
    │   ├── auth-service.js           # createAuthService({ userRepository })
    │   └── errors.js                 # InvalidCredentialsError
    └── infrastructure/
        ├── database/
        │   ├── knex.js               # Instancia de Knex a partir de knexfile.cjs
        │   └── user-repository.js    # createUserRepository(knex): findByEmail(email)
        └── http/
            ├── public-router.js      # Router montado en /api/public
            └── login-request.js      # parseLoginRequest(body)
```

Las dependencias van solo hacia dentro: infraestructura → aplicación → dominio.
La aplicación no importa Express ni Knex; recibe el repositorio por parámetro.

Alternativa descartada: meter todo en `server/index.js`, como `notes`. Sería
más corto ahora, pero el paso siguiente (hash de contraseñas, sesión) obligaría
a reorganizarlo.

### 2. Inyección de dependencias con funciones fábrica

Cada pieza se crea con una función que recibe sus dependencias
(`createAuthService({ userRepository })`, `createApp({ authService })`).
`server/index.js` es el único sitio que las conecta. Así los tests pasan un
repositorio en memoria o una base de datos temporal sin *mocks* de módulos.

Alternativa descartada: clases con contenedor de dependencias. Es más
ceremonia de la que necesita un proyecto de este tamaño.

### 3. Flujo de una petición de login

1. `public-router.js` recibe `POST /api/public/login`.
2. `parseLoginRequest(body)` comprueba la forma de la petición (tipos, no
   vacío, longitudes máximas de la especificación) y normaliza el email
   (`trim` y minúsculas). Si no es válida, el router responde `400` sin llamar
   al servicio.
3. `authService.login({ email, password })` llama a
   `userRepository.findByEmail(email)`. Si no hay usuario, o si
   `user.password !== password`, lanza `InvalidCredentialsError`.
4. Si todo cuadra, el servicio devuelve `toPublicUser(user)`
   (`{ email, name, isAdmin }`, sin contraseña) y el router responde `200`.
5. El router traduce `InvalidCredentialsError` a `401`. Cualquier otro error
   sigue al manejador de Express y acaba en `500`.

La validación de la forma vive en infraestructura porque depende de HTTP/JSON;
la regla "la contraseña coincide" vive en aplicación porque es lógica de
negocio que cambiará en los siguientes pasos (hash, después prueba de
conocimiento sin enviar la contraseña).

### 4. Comparación en texto claro y dónde cambiará

La comparación es `===` dentro del servicio, en una sola línea, con un
comentario que indica que es provisional. Es el punto exacto que sustituirá la
capa de seguridad del equipo en el siguiente paso. No se usa
`crypto.timingSafeEqual`: sería una medida de seguridad y este paso no las
incluye a propósito.

### 5. Base de datos

- Nueva migración `add_password_to_user`: añade `id` como clave primaria
  autoincremental, `password` (texto, no nulo) y un índice único en `email`.
  SQLite no permite añadir una clave primaria a una tabla existente, así que la
  migración recrea la tabla `USER` copiando las filas que hubiera (con
  contraseña vacía, que nunca pasa la validación de la petición). `down`
  vuelve al esquema anterior.
- El email se guarda siempre en minúsculas; el repositorio busca por igualdad
  exacta.
- Nuevo *seed* `server/seeds/01_usuarios_demo.cjs`, que borra y vuelve a crear
  dos usuarios: `empleado@empresa.com` / `demo1234` (empleado) y
  `admin@empresa.com` / `admin1234` (administrador). Se añade el script
  `db:seed` y la configuración `seeds` al `knexfile.cjs`.
- El repositorio usa Knex, igual que las migraciones. `notes` sigue con
  better-sqlite3; ambos abren el mismo archivo y SQLite en modo WAL lo admite.

Alternativa descartada: renombrar la tabla a `Usuarios`. El nombre `USER` ya
está en la migración aplicada y en la documentación; cambiarlo no aporta nada
en este paso.

### 6. Respuestas de la API

| Caso | Código | Cuerpo |
| --- | --- | --- |
| Credenciales válidas | 200 | `{ "email", "name", "isAdmin" }` |
| Email inexistente o contraseña incorrecta | 401 | `{ "error": "Credenciales inválidas" }` |
| Cuerpo mal formado | 400 | `{ "error": "Petición de login no válida" }` |
| JSON ilegible | 400 | el mismo cuerpo que el caso anterior |
| Error inesperado | 500 | `{ "error": "Error interno del servidor" }` |

Cada router monta su propio `express.json()`. Para el JSON ilegible, el router
público tiene un manejador de errores que convierte el error de parseo en ese
`400`, sin afectar a los mensajes de otros recursos. `createApp` añade al final
un manejador común para los errores que ningún router trate (`400` genérico o
`500`). Para que los tests no abran la base de datos real, `createApp` recibe
el recurso `notes` como dependencia opcional (`notesStore`).

### 7. Cliente

- `login()` en `client/src/api/auth.js` hace `fetch('/api/public/login')` y
  devuelve `{ email, name, isAdmin }`. Ante un `401` lanza un error con
  `GENERIC_LOGIN_ERROR`; ante cualquier otro fallo, uno con el mensaje de
  conexión.
- `LoginForm.jsx` muestra `error.message` en lugar de un texto fijo.
- `logout()` sigue siendo local: no hay sesión en el servidor que cerrar.
- Se eliminan las credenciales de demostración del cliente; ahora viven en el
  *seed*.

### 8. Tests

`node:test` (incluido en Node 20, sin dependencias nuevas) con un script
`npm test` en el workspace del servidor:

- **Servicio**: con un repositorio en memoria.
- **Endpoint**: `createApp` sobre una base de datos SQLite temporal migrada y
  sembrada, escuchando en un puerto aleatorio y llamada con `fetch`. Cubre los
  escenarios de la especificación.

El cliente se comprueba a mano en el navegador; no se añade un framework de
tests de interfaz en este paso.

## Risks / Trade-offs

- [Contraseñas en claro en la base de datos y en la red] → Es el objetivo
  explícito del paso. El README, la memoria y un comentario en el servicio lo
  dicen claramente, y el paso siguiente lo sustituye.
- [El *seed* deja credenciales conocidas] → Solo para desarrollo; el README lo
  indica.
- [Dos librerías de acceso a SQLite a la vez] → Temporal hasta que se retire
  `notes`.
- [Recrear la tabla `USER` en la migración] → Hoy no tiene datos reales;
  `down` está probado con `db:rollback`.

## Migration Plan

1. `npm install` (no hay dependencias nuevas, pero conviene tras cambiar de rama).
2. `npm run db:migrate --workspace=server`
3. `npm run db:seed --workspace=server`
4. `npm run dev` y entrar con `empleado@empresa.com` / `demo1234`.

Para deshacerlo: `npm run db:rollback --workspace=server` y volver al commit
anterior.
