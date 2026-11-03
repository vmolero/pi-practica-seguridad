# Propuesta: par de claves del usuario en el alta

## Why

El enunciado de la fase 1 pide que cada usuario cifre sus datos con claves AES
aleatorias gestionadas con **sus propias claves asimétricas**. Hoy la tabla
`USER` no guarda ningún material criptográfico, así que el siguiente paso
(cifrar las tarjetas) no tiene dónde apoyarse. Este cambio es el primer bloque:
cada usuario nuevo recibe su par de claves en el momento del alta, generado en
el navegador, tal y como describe `docs/diagrama-secuencia-alta-usuario.md`.

## What Changes

- **Migración**: la tabla `USER` gana tres columnas, todas admiten `NULL`:
  - `publicKey`: la clave pública `K_U`, en claro;
  - `encryptedPrivateKey`: la clave privada cifrada `c_kU`;
  - `privateKeyIv`: el `VI` con el que se cifró.
- **Generación en el cliente**: al dar de alta un usuario desde el panel del
  administrador, el navegador:
  - calcula `h = SHA3-256(pw)` sobre la contraseña inicial y toma
    `K_D = h[128..255]`;
  - genera un par RSA-OAEP de 2048 bits `(K_U, k_U)`;
  - cifra `k_U` con AES-128-CBC usando `K_D` y un `VI` aleatorio;
  - envía `K_U`, `c_kU` y `VI` en el alta.

  Ni `k_U` ni `K_D` salen nunca del navegador.
- **Confirmación de la contraseña**: el formulario de alta pide la contraseña
  dos veces, como en el diagrama, antes de derivar nada.
- **API**:
  - `POST /api/private/admin/users` exige además `publicKey`,
    `encryptedPrivateKey` y `privateKeyIv`.
  - El servidor comprueba el formato y que la clave pública sea RSA de al menos
    2048 bits, y guarda los tres valores.
  - Ninguna respuesta devuelve la clave privada cifrada ni el `VI`.
- **Semilla**: los usuarios de demostración se crean con su par de claves,
  usando el mismo módulo que el navegador.
- **BREAKING**: un alta sin los tres campos de clave responde
  `400 Datos de usuario no válidos`. Hay que actualizar el ejemplo de `curl`
  del README.

**Qué queda como está (provisional).** La contraseña inicial se sigue enviando
y guardando en claro, porque el login actual la compara así. Mientras sea así,
el servidor podría recalcular `K_D` y no se cumple el conocimiento cero. Lo
resolverá el cambio siguiente, que sustituye la contraseña por
`K_L`/`h_L = KDF(K_L ‖ pimienta, sal)` según `docs/diagrama-secuencia-login.md`.

**Fuera de alcance:**
- el login con `K_L` y la sal/pimienta en el servidor;
- devolver `c_kU` y `VI` al cliente al iniciar sesión;
- cifrar las tarjetas;
- generar claves para los usuarios ya existentes que no son de la semilla
  (quedan con `NULL`);
- el cambio de contraseña y la rotación de claves.

**Relación con `fase-1-registro-y-cifrado`.** Este cambio adelanta una parte
de las claves de usuario de ese cambio, con el esquema de los diagramas de
`docs/` en vez de PBKDF2/HKDF/AES-GCM, y con alta desde el panel del
administrador en vez de por invitación. Cuando se retome, `fase-1` deberá
ajustarse a lo que quede implantado aquí.

**Reparto.** La generación del par, la derivación de `K_D` y el cifrado de
`k_U` son capa de seguridad: los implementa el equipo. Claude implementa la
migración, la API, la persistencia, el formulario, la semilla y las pruebas
contra la interfaz acordada en `design.md`, con una implementación
provisional marcada hasta que el equipo entregue la suya.

## Capabilities

### New Capabilities
- `claves-usuario`: cómo se generan en el navegador, se protegen y se guardan
  el par de claves RSA de cada usuario y su clave privada cifrada con `K_D`.

### Modified Capabilities
- `administracion-usuarios`: cambian tres requisitos:
  - el alta recibe y guarda las claves del usuario;
  - la validación del alta incluye los campos de clave;
  - el panel pide la contraseña dos veces y genera las claves antes de enviar.

## Impact

- **Servidor:**
  - nueva migración en `server/migrations/`;
  - `server/src/infrastructure/http/user-request.js` (validación de los campos
    de clave);
  - `server/src/application/user-admin-service.js`;
  - `server/src/infrastructure/database/user-repository.js` (insertar las
    columnas nuevas sin devolverlas);
  - `server/seeds/01_usuarios_demo.cjs`;
  - pruebas en `server/test/` (`user-request`, `user-admin-service`,
    `user-repository`, `admin-users`, `database`).
- **Cliente:**
  - nuevo módulo `client/src/security/claves-usuario.js` (interfaz de la capa
    de seguridad);
  - `client/src/components/UserAdminPanel.jsx` (campo de confirmación y
    llamada al módulo);
  - `client/src/api/admin-users.js`;
  - pruebas con `node --test`.
- **Dependencias:** Web Crypto no ofrece SHA3-256, así que hace falta una
  implementación (ver `design.md`). La propuesta inicial es `@noble/hashes`.
- **Documentación afectada:**
  - `README.md`: «Desarrollo» (la semilla genera claves), «API» (el cuerpo del
    alta y el ejemplo de `curl`) y «Estado actual».
  - `docs/primera-memoria/implementacion-y-seguridad.md`:
    - una sección nueva «Claves del usuario (paso 7)», con notación,
      parámetros y qué no protege todavía;
    - actualizar «Tabla `USER`» y «Estructura del proyecto»;
    - quitar el punto correspondiente de «Trabajo futuro».
  - `docs/primera-memoria/manual-de-usuario.md`: «Dar de alta un usuario»
    (confirmación de la contraseña y la espera mientras se generan las claves).
  - `docs/diagrama-secuencia-alta-usuario.md`: anotar qué partes del diagrama
    están ya implantadas y cuáles siguen siendo propuesta.
  - `docs/primera-memoria/stack-tecnologico.md`, si se añade la librería de
    SHA3.
