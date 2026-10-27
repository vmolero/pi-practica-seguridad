# Propuesta: paso 6 — HTTPS obligatorio con certificados autofirmados

## Why

Hoy el servidor escucha por HTTP (`http://localhost:3000`) y el cliente de
desarrollo también (`http://localhost:5173`). La contraseña del login, el JWT
y los datos de las tarjetas viajan en claro, y cualquiera que observe la red
los ve. La memoria ya lo reconoce como una carencia
(`docs/primera-memoria/implementacion-y-seguridad.md`). Las anotaciones de
clase piden empezar por securizar el canal con certificados autofirmados
generados con OpenSSL. Además, los diagramas de secuencia de alta, login y
tarjetas (`docs/diagrama-secuencia-*.md`) dan por hecho que todo el tráfico
va por HTTPS.

## What Changes

- **Un certificado autofirmado para cada parte.** El cliente (el servidor de
  desarrollo de Vite, que entrega la interfaz) y el servidor (la API de
  Express) tienen **cada uno su propio par de claves y su propio certificado
  X.509 autofirmado**. Si uno de los dos se ve comprometido, el otro no queda
  afectado.
- **Generación con OpenSSL.** Un nuevo comando `npm run cert` genera los dos
  certificados para `localhost`, `127.0.0.1` y `::1`:
  - el del servidor, en `server/certs/`;
  - el del cliente, en `client/certs/`.

  Ninguno de los dos directorios se versiona. El comando no sobrescribe
  certificados existentes salvo que se pida expresamente. Si OpenSSL no está
  instalado, explica cómo instalarlo, también en Windows.
- **El servidor solo atiende por HTTPS.** **BREAKING:** el servidor deja de
  escuchar por HTTP. Arranca un servidor HTTPS con su certificado y no abre
  ningún puerto HTTP. Si faltan el certificado o la clave, o no son válidos,
  **no arranca** y explica cómo generarlos. Las variables `TLS_CERT_FILE` y
  `TLS_KEY_FILE` permiten usar otros ficheros.
- **El cliente solo se sirve por HTTPS.** **BREAKING:** Vite sirve la interfaz
  por HTTPS con el certificado del cliente, porque la contraseña viaja del
  navegador a Vite. Si falta el certificado, no arranca. El proxy de `/api`
  habla con el servidor por HTTPS y **verifica el certificado del servidor**,
  sin desactivar la comprobación.
- **Pruebas** de que el servidor responde por HTTPS, rechaza HTTP y no arranca
  sin un certificado válido.

**Fuera de alcance:**

- Certificados de una autoridad de certificación real y el despliegue en
  producción.
- La autenticación mutua TLS: que el cliente presente su certificado al
  servidor. Queda como posible mejora (ver `design.md`).
- Las cabeceras de seguridad (HSTS, CSP, etc.) que pide el requisito
  «Transporte cifrado» de `fase-1-registro-y-cifrado`. Este paso solo cubre
  la parte de «solo por HTTPS».
- La autenticación del servidor con su propio par de claves (reto firmado),
  que es otra parte de la fase 1.

## Capabilities

### New Capabilities

- `canal-seguro`: un certificado autofirmado para el cliente y otro para el
  servidor, generados con OpenSSL. Cliente y servidor se sirven solo por
  HTTPS, el proxy verifica el certificado del servidor y ninguno arranca sin
  un certificado válido. Es el primer paso del requisito «Transporte cifrado»
  de `fase-1-registro-y-cifrado`.

### Modified Capabilities

Ninguna. Las capacidades actuales (`autenticacion`,
`administracion-usuarios`, `almacen-tarjetas` y `panel-tarjetas`) no cambian
sus requisitos: siguen funcionando igual, solo que sobre HTTPS.

## Impact

- **Código:**
  - `server/index.js` pasa a crear un servidor HTTPS.
  - `server/src/config.js` lee `TLS_CERT_FILE` y `TLS_KEY_FILE`.
  - Nuevo script de generación de los certificados.
  - `client/vite.config.js` pasa a servir por HTTPS y configura el proxy para
    que verifique el certificado del servidor.
  - Nuevas pruebas del servidor HTTPS.
- **Dependencias:** ninguna de npm. Hace falta tener OpenSSL instalado para
  generar los certificados. En Linux suele venir instalado. En Windows viene
  con Git for Windows o se instala aparte.
- **Ficheros nuevos que no se versionan:** `server/certs/` y `client/certs/`
  (se añaden a `.gitignore`).
- **Uso:** las URL pasan a ser `https://localhost:5173` y
  `https://localhost:3000`. El navegador avisará de que el certificado del
  cliente no es de confianza hasta que se acepte o se importe.
- **Documentación afectada:**
  - `README.md`: puesta en marcha (nuevo paso `npm run cert`), URL,
    variables de entorno (`TLS_CERT_FILE` y `TLS_KEY_FILE`) y ejemplos de
    `curl`, que pasan a usar `https://` y `--cacert`.
  - `docs/primera-memoria/implementacion-y-seguridad.md`: nueva sección sobre
    el cifrado del canal (dos certificados autofirmados, OpenSSL, parámetros y
    limitaciones). Hay que quitar «Sin HTTPS…» de los riesgos y «Cifrar el
    canal (HTTPS)» de las mejoras pendientes.
  - `docs/primera-memoria/manual-de-usuario.md`: cómo generar los
    certificados y cómo aceptar el aviso del navegador.
  - `docs/primera-memoria/stack-tecnologico.md`: OpenSSL como herramienta
    necesaria.
  - `docs/primera-memoria/certificados-autofirmados.md`: documento nuevo con
    el proceso de creación, instalación y uso de los certificados.
