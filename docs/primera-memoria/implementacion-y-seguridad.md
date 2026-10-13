# Implementación y seguridad

Este documento describe cómo está organizado el código y qué medidas de
seguridad se aplican en cada parte. En esta iteración (paso 1) el login ya
funciona de extremo a extremo, pero **sin ninguna medida de seguridad**: la
contraseña viaja y se guarda en texto claro. Es la base sobre la que los pasos
siguientes añadirán la criptografía; no es el diseño final.

## Estructura del proyecto

El proyecto es un repositorio único con dos paquetes gestionados mediante
**npm workspaces** desde la raíz:

```text
.
├── package.json              # Define los workspaces y los scripts comunes (dev, build...)
├── client/                   # Frontend: Vite + React (JavaScript)
│   ├── index.html            # Página única; monta la aplicación en #root
│   ├── vite.config.js        # Plugin de React y proxy de /api hacia el servidor
│   └── src/
│       ├── main.jsx          # Punto de entrada: renderiza <App />
│       ├── App.jsx           # Decide si mostrar el login o la sesión iniciada
│       ├── style.css
│       ├── api/
│       │   └── auth.js       # login() llama a la API; logout() es local
│       └── components/
│           ├── LoginForm.jsx    # Formulario de email y contraseña
│           └── SessionView.jsx  # Vista de sesión iniciada con "Cerrar sesión"
└── server/                   # Backend: Node.js + Express + Knex + SQLite
    ├── index.js              # Arranque: construye las dependencias y escucha el puerto
    ├── database.js           # Recurso notes de demostración (better-sqlite3)
    ├── knexfile.cjs
    ├── migrations/           # Migraciones de Knex (tabla USER)
    ├── seeds/                # Usuarios de prueba para desarrollo
    ├── test/                 # Tests con node:test
    └── src/
        ├── app.js            # createApp(): monta los routers y el manejo de errores
        ├── domain/
        │   └── user.js       # toPublicUser(): datos del usuario sin contraseña
        ├── application/
        │   ├── auth-service.js  # Servicio de autenticación
        │   └── errors.js        # InvalidCredentialsError
        └── infrastructure/
            ├── database/
            │   ├── knex.js              # Conexión de Knex
            │   └── user-repository.js   # findByEmail(email)
            └── http/
                ├── public-router.js     # /api/public (sin sesión)
                ├── login-request.js     # Validación de la petición de login
                └── notes-router.js      # /api/notes (demostración)
```

`npm run dev` en la raíz arranca a la vez el cliente (Vite, puerto 5173) y el
servidor (Express, puerto 3000). En desarrollo, el proxy de Vite reenvía las
peticiones a `/api` al servidor, así que el navegador solo habla con un origen.

## Vista de login

### Componentes

- **`App.jsx`** guarda en el estado de React el usuario autenticado
  (`{ email, name, isAdmin }`) o `null`. Si hay usuario muestra `SessionView`; si no, muestra
  `LoginForm`. El estado solo vive en memoria: al recargar la página se vuelve
  a la pantalla de login.
- **`LoginForm.jsx`** contiene el formulario. Valida los campos, llama a
  `login()` y, si todo va bien, entrega el usuario a `App` mediante
  `onSuccess`.
- **`SessionView.jsx`** muestra el email del usuario y el botón **Cerrar
  sesión**. Al aparecer, mueve el foco al título para que los lectores de
  pantalla anuncien el cambio.

### Capa de autenticación (`client/src/api/auth.js`)

Toda la comunicación con el servidor relacionada con la autenticación está en
este módulo, que exporta:

- `login({ email, password })`: envía `POST /api/public/login` con un cuerpo
  JSON `{ email, password }` y devuelve `{ email, name, isAdmin }` si el
  servidor responde `200`. Si responde `401`, lanza un `Error` con
  `GENERIC_LOGIN_ERROR`; ante cualquier otro fallo (servidor caído, error
  `5xx`, petición rechazada) lanza uno con `CONNECTION_ERROR`.
- `logout()`: todavía no hay sesión en el servidor, así que no hace nada; el
  cierre de sesión se limita a borrar el usuario del estado de `App`.
- `GENERIC_LOGIN_ERROR`: `"Email o contraseña incorrectos."`.
- `CONNECTION_ERROR`: `"No se ha podido iniciar sesión. Inténtalo de nuevo."`.

`LoginForm` muestra el mensaje del error que lanza `login()`. Como `auth.js`
solo produce esos dos mensajes, la interfaz nunca muestra el texto que devuelve
el servidor.

### Validación en el cliente

El formulario usa `noValidate` para desactivar la validación nativa del
navegador y aplicar la suya propia, con mensajes en español:

| Comprobación                                    | Mensaje                                       |
|-------------------------------------------------|-----------------------------------------------|
| Email vacío (tras quitar espacios)              | `Introduce tu email.`                         |
| Email sin formato `algo@dominio.ext`            | `Introduce un email con un formato válido.`   |
| Contraseña vacía                                | `Introduce tu contraseña.`                    |

El email se envía sin los espacios del principio y del final. La contraseña se
envía tal cual, sin recortarla.

### Medidas de seguridad en el cliente

- **No se persiste la contraseña.** La contraseña solo vive en el estado del
  formulario mientras el usuario la escribe y se pasa a `login()`. No se guarda
  en `localStorage`, `sessionStorage`, cookies ni en ningún otro almacenamiento
  del navegador, y no se escribe en la consola. El campo se vacía tanto después
  de un login correcto como de uno fallido. `App` solo guarda el email del
  usuario, y únicamente en memoria.
- **Mensajes de error genéricos.** Si las credenciales no son válidas, el
  formulario muestra siempre `Email o contraseña incorrectos.`, sin indicar si
  el email no existe o si la contraseña es incorrecta. Si el fallo es de otro
  tipo, muestra el mensaje genérico de conexión, sin detalles técnicos. Así no se facilita la enumeración de usuarios. El mensaje se
  muestra en una zona con `role="alert"` para que los lectores de pantalla lo
  anuncien.
- **Atributos `autocomplete` adecuados.** El campo de email usa `type="email"`
  y `autocomplete="username"` (además de `autocapitalize="none"` y
  `spellcheck="false"`); el de contraseña usa `type="password"` y
  `autocomplete="current-password"`. Así los gestores de contraseñas funcionan
  correctamente, lo que favorece el uso de contraseñas largas y únicas.
- **Sin envíos duplicados.** Mientras la petición está en curso, los campos y
  el botón quedan deshabilitados y se ignoran nuevos envíos.
- **La validación del cliente no sustituye a la del servidor.** Las
  comprobaciones anteriores solo mejoran la experiencia de usuario. Cualquiera
  puede saltárselas enviando peticiones directamente a la API, por lo que el
  servidor vuelve a validar los datos que recibe (ver más abajo).

## Servidor: login en texto claro (paso 1)

### Arquitectura por capas

El código nuevo del servidor está en `server/src/` y se divide en tres capas.
Las dependencias van solo hacia dentro (infraestructura → aplicación →
dominio):

- **Dominio** (`domain/user.js`): `toPublicUser(user)` devuelve los datos del
  usuario que se pueden enviar al cliente, `{ email, name, isAdmin }`, y nunca
  la contraseña.
- **Aplicación** (`application/auth-service.js`): el servicio de autenticación.
  `login({ email, password })` pide el usuario al repositorio y comprueba la
  contraseña. No sabe nada de HTTP ni de la base de datos.
- **Infraestructura**:
  - `http/public-router.js` monta la sección pública de la API,
    `/api/public`, con los endpoints que no requieren sesión.
  - `http/login-request.js` comprueba la forma de la petición.
  - `database/user-repository.js` busca usuarios en la tabla `USER` con Knex.

Cada pieza se crea con una función fábrica que recibe sus dependencias
(`createAuthService({ userRepository })`, `createApp({ authService })`) y
`server/index.js` es el único sitio que las conecta. Así los tests usan un
repositorio en memoria o una base de datos temporal sin tocar la real.

### Flujo de `POST /api/public/login`

1. El router recibe el cuerpo JSON. Si no es JSON válido, responde `400`.
2. `parseLoginRequest` exige que `email` y `password` sean cadenas no vacías
   de como máximo 254 y 128 caracteres. Si no lo son, responde `400` sin
   consultar la base de datos. El email se normaliza (sin espacios y en
   minúsculas); la contraseña se usa tal cual.
3. El servicio busca el usuario por email y compara la contraseña con `===`.
   Si el usuario no existe o la contraseña no coincide, lanza
   `InvalidCredentialsError`.
4. El router responde `200` con `toPublicUser(user)` o `401` con
   `{ "error": "Credenciales inválidas" }`.

| Caso | Código | Cuerpo |
| --- | --- | --- |
| Credenciales válidas | 200 | `{ "email", "name", "isAdmin" }` |
| Email inexistente o contraseña incorrecta | 401 | `{ "error": "Credenciales inválidas" }` |
| Cuerpo mal formado o JSON ilegible | 400 | `{ "error": "Petición de login no válida" }` |
| Error inesperado | 500 | `{ "error": "Error interno del servidor" }` |

### Tabla `USER`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | entero | Clave primaria autoincremental |
| `name` | texto | Obligatorio |
| `email` | texto | Obligatorio, único, siempre en minúsculas |
| `password` | texto | Obligatorio. **En texto claro** en este paso |
| `isAdmin` | booleano | `true` para gestores; por defecto `false` |

El seed `server/seeds/01_usuarios_demo.cjs` crea un empleado y un
administrador de prueba para desarrollo.

### Lo que este paso no protege

Este paso deja a propósito sin resolver todos los riesgos siguientes:

- La contraseña viaja en claro por HTTP: cualquiera que observe la red la ve.
- La contraseña se guarda en claro: quien lea la base de datos obtiene todas.
- La comparación con `===` no es de tiempo constante.
- No hay sesión en el servidor: la API no puede saber quién hace cada petición.
- No hay límite de intentos de login.

La comparación está aislada en una sola línea de `auth-service.js`, marcada
como provisional, para que la capa de seguridad la sustituya sin tocar el resto
del código.

## Trabajo futuro

- Implementar un endpoint de cierre de sesión que invalide la sesión en el
  servidor y llamarlo desde `logout()`.
- Cifrar el canal (HTTPS) para que la contraseña no viaje en claro.
- Almacenar las contraseñas con una función de hash adecuada para contraseñas,
  con sal (la librería concreta está pendiente de decidir; ver
  [Stack tecnológico](stack-tecnologico.md)), en lugar de en texto claro.
- Decidir el mecanismo de sesión y protegerlo (por ejemplo, cookies con
  `HttpOnly`, `Secure` y `SameSite`). Con ello la sesión sobrevivirá a una
  recarga de la página, lo que hoy no ocurre.
- Responder con el mismo error y en un tiempo similar tanto si el email no
  existe como si la contraseña es incorrecta.
- Limitar los intentos de login fallidos para dificultar ataques de fuerza
  bruta.
- Control de acceso por rol (gestor / empleado) en cada endpoint y en la
  interfaz, que hoy no distingue roles.
