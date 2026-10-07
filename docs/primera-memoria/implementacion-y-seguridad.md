# Implementación y seguridad

Este documento describe cómo está organizado el código y qué medidas de
seguridad se aplican en cada parte. Es una primera versión: en esta iteración
solo está implementada la vista de login del cliente, sin backend de
autenticación real.

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
│       │   └── auth.js       # login() y logout(); simulados por ahora
│       └── components/
│           ├── LoginForm.jsx    # Formulario de email y contraseña
│           └── SessionView.jsx  # Vista de sesión iniciada con "Cerrar sesión"
└── server/                   # Backend: Node.js + Express + Knex + SQLite
    ├── index.js
    ├── database.js
    ├── knexfile.cjs
    └── migrations/           # Migraciones de Knex (tabla USER)
```

`npm run dev` en la raíz arranca a la vez el cliente (Vite, puerto 5173) y el
servidor (Express, puerto 3000). En desarrollo, el proxy de Vite reenvía las
peticiones a `/api` al servidor, así que el navegador solo habla con un origen.

## Vista de login

### Componentes

- **`App.jsx`** guarda en el estado de React el usuario autenticado
  (`{ email }`) o `null`. Si hay usuario muestra `SessionView`; si no, muestra
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

- `login({ email, password })`: devuelve `{ email }` si las credenciales son
  válidas y lanza un `Error` con un mensaje genérico si no lo son.
- `logout()`: cierra la sesión.
- `GENERIC_LOGIN_ERROR`: el mensaje único de error,
  `"Email o contraseña incorrectos."`.

En esta iteración ambas funciones están **simuladas**:

- `login()` espera 800 ms para imitar la latencia de red y acepta solo las
  credenciales de prueba `empleado@empresa.com` / `demo1234` (el email se
  compara sin distinguir mayúsculas y minúsculas). Con cualquier otra
  combinación lanza el error genérico. Estas credenciales están escritas en el
  propio código del cliente, **solo existen en la simulación** y desaparecerán
  cuando se conecte el backend real; nunca deben llegar a producción.
- `logout()` no hace nada todavía; el cierre de sesión se limita a borrar el
  usuario del estado de `App`.

El módulo ya incluye, comentada, la llamada real a `POST /api/login`. Cuando
exista el backend se sustituirá la simulación por esa llamada sin modificar los
componentes.

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
- **Mensajes de error genéricos.** Si el login falla, el formulario muestra
  siempre `Email o contraseña incorrectos.`, sin indicar si el email no existe
  o si la contraseña es incorrecta, y sin mostrar el mensaje concreto del error
  capturado. Así no se facilita la enumeración de usuarios. El mensaje se
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
  servidor deberá volver a validar todos los datos que reciba.
- **Credenciales de prueba en el código.** Son aceptables solo porque la
  autenticación está simulada y no protegen ningún dato real. Deben eliminarse
  al conectar el backend.

## Trabajo futuro: backend de autenticación

Contrato previsto entre cliente y servidor:

- `POST /api/login` con cuerpo JSON `{ "email": "...", "password": "..." }`.
- **200**: credenciales correctas; el servidor establece la sesión.
- **401** con cuerpo `{ "error": "Credenciales inválidas" }` si las
  credenciales no son válidas.

El cliente no muestra el texto que devuelve el servidor: ante un 401 muestra su
propio mensaje genérico, `Email o contraseña incorrectos.`, así que la interfaz
no depende del texto exacto de la respuesta.

Tareas pendientes:

- Implementar el endpoint `POST /api/login` y sustituir la simulación de
  `login()` en `client/src/api/auth.js` por la llamada real, eliminando las
  credenciales de prueba.
- Implementar un endpoint de cierre de sesión que invalide la sesión en el
  servidor y llamarlo desde `logout()`.
- Validar en el servidor el formato y la presencia de `email` y `password`.
- Almacenar las contraseñas con una función de hash adecuada para contraseñas
  (la librería concreta está pendiente de decidir; ver
  [Stack tecnológico](stack-tecnologico.md)). La tabla `USER` actual todavía no
  tiene columna para el hash de la contraseña, así que habrá que añadirla con
  una nueva migración.
- Decidir el mecanismo de sesión y protegerlo (por ejemplo, cookies con
  `HttpOnly`, `Secure` y `SameSite`). Con ello la sesión sobrevivirá a una
  recarga de la página, lo que hoy no ocurre.
- Responder con el mismo error y en un tiempo similar tanto si el email no
  existe como si la contraseña es incorrecta.
- Limitar los intentos de login fallidos para dificultar ataques de fuerza
  bruta.
- Control de acceso por rol (gestor / empleado) en cada endpoint y en la
  interfaz, que hoy no distingue roles.
