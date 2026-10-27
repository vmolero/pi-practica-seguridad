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

**Propuesta pendiente de confirmar por el equipo.** El diseño de la fase 1
(`openspec/changes/fase-1-registro-y-cifrado/design.md`, decisiones D1 y D2)
propone usar solo criptografía nativa, sin dependencias externas:
**Web Crypto** en el navegador y **`node:crypto`** en el servidor. Los
algoritmos concretos los decide el equipo. Si cambian, estas tablas se
actualizarán.

#### Cliente (navegador): Web Crypto API (`crypto.subtle`)

Está integrada en todos los navegadores modernos y no hay que instalar nada.

| Uso | Primitiva |
|---|---|
| Derivar claves desde la contraseña | PBKDF2-HMAC-SHA-256 y HKDF |
| Cifrar la clave privada y los datos de las tarjetas | AES-GCM (también hay AES-CBC) |
| Par de claves del usuario y envoltura de la clave de cada tarjeta | RSA-OAEP |
| Firma (reto-respuesta) | ECDSA P-256 |
| Valores aleatorios (VI, claves, sales) | `crypto.getRandomValues` |

#### Servidor (Node.js): módulo nativo `node:crypto`

Por debajo usa la versión de OpenSSL que incluye Node.js.

| Uso | Primitiva |
|---|---|
| Hash lento de la clave de login con sal y pimienta | `crypto.scrypt` (`crypto.argon2` solo existe a partir de Node 24) |
| Resúmenes y HMAC | `createHash` y `createHmac` (incluido `sha3-256`) |
| Comparación en tiempo constante | `timingSafeEqual` |
| Valores aleatorios | `randomBytes` |
| Firma del servidor | `sign` y `verify` |

#### Otras piezas que ya se usan

- **`jose`** (npm): firma y verificación del token de sesión (JWT).
  **Provisional**: hoy firma con HS256 (HMAC con secreto compartido) hasta
  que el equipo entregue la firma asimétrica con el par de claves del
  servidor.
- **`node:https`** y la herramienta **OpenSSL**: cifrado del canal (ver el
  apartado «Cifrado del canal»).

#### Decisiones abiertas

1. **SHA3-256 en el navegador.** Los diagramas de secuencia
   (`docs/diagrama-secuencia-*.md`) calculan `H(pw) = SHA3-256(pw)` en el
   cliente, pero Web Crypto no tiene SHA-3: solo SHA-1, SHA-256, SHA-384 y
   SHA-512. Hay dos opciones:
   - usar SHA-256 o, mejor, PBKDF2 sobre SHA-256, como propone el diseño de
     la fase 1. Así además se evita que el hash sin sal sea demasiado rápido
     frente a la fuerza bruta;
   - añadir una librería pequeña y auditada como `@noble/hashes`, que tiene
     SHA-3, scrypt y Argon2 en JavaScript puro.
2. **Argon2 en el servidor.** `crypto.argon2` requiere Node 24, pero el
   proyecto declara `node >= 20` en `package.json`. Si se elige Argon2 habrá
   que subir la versión mínima de Node. `scrypt` está disponible en todas las
   versiones.
3. **Argon2 o scrypt en el navegador.** Web Crypto no los tiene. Harían falta
   una librería (`@noble/hashes` o una en WASM).
