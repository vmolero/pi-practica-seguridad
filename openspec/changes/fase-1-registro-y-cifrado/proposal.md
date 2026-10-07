# Propuesta: fase 1 — registro, autenticación y bóveda cifrada de tarjetas

## Why

La primera entrega de la práctica (1 de noviembre de 2026) exige definir los
datos a proteger, una arquitectura cliente/servidor con registro de
administradores y usuarios, y que cada usuario cifre y descifre sus datos con
claves AES aleatorias gestionadas mediante sus propias claves asimétricas.
Hoy solo existe una pantalla de login simulada y una tabla `USER` sin ningún
material criptográfico, así que nada de lo que exige el enunciado está cubierto.

## What Changes

- **Datos a proteger (definición de fase 1)**: los datos de cada tarjeta
  (alias, titular, número, caducidad y notas), la contraseña del usuario, su
  clave privada y el secreto de su doble factor. Los datos de las tarjetas se
  cifran en el navegador: el servidor nunca los ve en claro (conocimiento cero).
- **Alta de usuarios por invitación**: el primer administrador se crea con un
  script del servidor; después un gestor (administrador) invita a cada empleado
  y este completa el alta en su navegador. Allí elige su contraseña, genera sus
  pares de claves y configura el doble factor.
- **Claves de usuario**: cada usuario tiene un par de claves de cifrado y otro
  de firma, generados en su navegador. La clave privada se guarda en el
  servidor cifrada con una clave derivada de la contraseña (PBKDF2 con sal),
  para poder entrar desde cualquier equipo. El servidor firma las claves
  públicas de cada usuario.
- **Identidad del servidor**: el servidor tiene su propio par de claves. El
  cliente conoce de antemano su clave pública y verifica sus firmas.
- **Autenticación mutua**: la contraseña nunca sale del navegador. El cliente
  prueba que la conoce enviando una clave derivada de ella, después introduce
  un código TOTP y termina con un reto-respuesta firmado en ambos sentidos.
  Solo entonces se crea la sesión.
- **Bóveda de tarjetas**: el empleado crea, consulta, edita y borra sus propias
  tarjetas. Cada tarjeta se cifra con AES en modo autenticado usando una clave
  aleatoria propia, que se guarda envuelta con la clave pública de cifrado del
  usuario. Cualquier manipulación de los datos cifrados se detecta.
- **Endurecimiento web**: sesión en cookie `HttpOnly`/`Secure`/`SameSite`, HTTPS
  también en desarrollo, limitación de intentos y errores genéricos que no
  revelan si un email existe.
- **BREAKING**: se sustituye el contrato previsto `POST /api/login` con
  `{email, password}` por un login en varios pasos en el que nunca se envía la
  contraseña. `client/src/api/auth.js` y la documentación de
  `docs/primera-memoria/` deberán actualizarse.
- **BREAKING**: la tabla `USER` se reemplaza por un esquema con los campos
  criptográficos necesarios, y se elimina el recurso de demostración `notes`
  (`/api/notes` y su tabla).

**Reparto del trabajo.** El equipo implementa toda la capa de seguridad:
derivación de claves, hash de la clave de autenticación, generación y custodia
de claves, cifrado y envoltura AES, firmas, verificación de integridad, TOTP y
el protocolo de reto-respuesta. Claude implementa el resto (interfaz, API,
persistencia, roles, scripts y pruebas de integración) contra una interfaz de
seguridad acordada. Mientras tanto usa implementaciones provisionales marcadas
como inseguras, que el equipo sustituye después. El detalle está en
`design.md` y en `tasks.md`.

**Fuera de alcance (fase 2):** compartir tarjetas entre usuarios, las tarjetas
y contratos de empresa que asigna el gestor, la rotación y revocación de claves,
la recuperación de cuenta y la versión ejecutable para Windows.

## Capabilities

### New Capabilities

- `gestion-usuarios`: alta del primer administrador, invitación de empleados,
  activación de la cuenta, roles (gestor y empleado) y desactivación de usuarios.
- `autenticacion`: inicio de sesión sin enviar la contraseña, doble factor
  TOTP, autenticación mutua por reto-respuesta asimétrico, sesiones, cierre de
  sesión, protección frente a enumeración de usuarios y fuerza bruta.
- `claves-usuario`: generación de los pares de claves en el cliente, custodia
  cifrada de la clave privada, certificación de las claves públicas por el
  servidor e identidad criptográfica del servidor.
- `boveda-tarjetas`: alta, consulta, edición y borrado de las tarjetas propias
  cifradas de extremo a extremo, con una clave AES aleatoria por tarjeta y
  verificación de integridad.

### Modified Capabilities

Ninguna: todavía no hay especificaciones en `openspec/specs/`.

## Impact

- **Cliente (`client/`)**: nuevas vistas (activar cuenta, configurar TOTP,
  login en varios pasos, lista y formulario de tarjetas, gestión de usuarios
  para el gestor) y un módulo `client/src/security/` con la capa criptográfica
  del cliente. Se reescribe `client/src/api/auth.js`.
- **Servidor (`server/`)**: nuevos endpoints bajo `/api/auth`, `/api/users`,
  `/api/invitations` y `/api/cards`; un módulo `server/security/` con la capa
  criptográfica del servidor; nuevas migraciones de Knex; un script para crear
  el par de claves del servidor y el primer administrador; HTTPS en
  desarrollo.
- **Dependencias**: la criptografía usa las APIs nativas (Web Crypto en el
  navegador y `node:crypto` en el servidor), sin librerías criptográficas
  externas salvo que el equipo decida otra cosa. Habrá dependencias auxiliares
  no criptográficas para la parte web (por ejemplo, la generación del código
  QR y las cabeceras de seguridad).
- **Windows**: todos los scripts deben funcionar en Windows sin herramientas
  de Unix.
- **Documentación**: la primera memoria (`docs/primera-memoria/`) debe describir
  el protocolo con notación inequívoca. Esa parte la redacta el equipo.
