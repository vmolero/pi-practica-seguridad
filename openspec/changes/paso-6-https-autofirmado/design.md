# Diseño

## Context

Ver `proposal.md` (Why) y `specs/canal-seguro/spec.md`. Estado actual:

- `server/index.js` arranca Express con `app.listen(config.port)` por HTTP.
  `createApp` (`server/src/app.js`) solo construye la aplicación y no sabe
  nada del transporte.
- `client/vite.config.js` sirve por HTTP en el puerto 5173 (con
  `--host 0.0.0.0`) y hace de proxy de `/api` hacia `http://localhost:3000`.
- Las pruebas de integración (`server/test/test-app.js`) llaman a
  `createApp(...).listen(0)` y usan `fetch` contra `http://127.0.0.1:<puerto>`.
- OpenSSL 3 está disponible en Linux. En Windows hay que instalarlo (viene
  con Git for Windows).
- Reparto del trabajo: la configuración del canal es infraestructura y la
  implementa Claude. El equipo decide y justifica los parámetros
  criptográficos (algoritmo y tamaño de clave, función resumen y validez) y
  los documenta en la memoria.

## Goals / Non-Goals

**Goals:**

- Ningún dato de la aplicación viaja en claro: navegador ↔ Vite y Vite ↔ API
  van por TLS.
- Cliente y servidor tienen identidades separadas: un par de claves y un
  certificado cada uno.
- Que no se pueda arrancar «sin querer» por HTTP: sin certificado no se
  arranca.
- Que funcione igual en Linux y en Windows.

**Non-Goals:**

- Una autoridad de certificación propia o certificados de una autoridad real.
- Autenticación mutua TLS (mTLS).
- Cabeceras de seguridad (HSTS, CSP…).
- Servir el cliente compilado desde Express en producción.

## Decisions

### D1. Dos certificados autofirmados independientes

El cliente (Vite) y el servidor (API) tienen cada uno su clave privada y su
certificado. Se distinguen por el sujeto:

- Servidor: `/CN=localhost/O=Tarjetas de empresa/OU=API`.
- Cliente: `/CN=localhost/O=Tarjetas de empresa/OU=Cliente web`.

Motivo: separar identidades limita el daño si una clave se filtra. Además,
cada certificado tiene un uso claro en la memoria: el del cliente es el que
ve el navegador, y el del servidor es el que verifica el proxy.

*Alternativa descartada:* un único certificado compartido. Es más sencillo,
pero mezcla las dos identidades y no cumple lo que pide el equipo.

*Alternativa descartada:* una autoridad de certificación propia que firme los
dos certificados. Habría que confiar en una sola raíz, pero añade una clave
de CA que proteger. Queda como mejora.

### D2. Parámetros de los certificados (los confirma el equipo)

Propuesta:

```
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout <dir>/key.pem -out <dir>/cert.pem \
  -subj "/CN=localhost/O=Tarjetas de empresa/OU=<API|Cliente web>" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
```

Este comando se ha probado con OpenSSL 3.0.13. Node verifica el certificado
para `localhost` y `127.0.0.1` si se le da como `ca`, y lo rechaza
(`DEPTH_ZERO_SELF_SIGNED_CERT`) si no se le da.

- **RSA 2048** con **SHA-256**. RSA es el algoritmo de clave pública del
  tema 4 de la asignatura. 2048 bits es el mínimo aceptado hoy. Alternativas:
  RSA 3072, o ECDSA P-256, que tiene claves más cortas y el mismo nivel de
  seguridad que RSA 3072.
- **`subjectAltName`.** Los navegadores ignoran el `CN` y solo miran el SAN.
- **`CA:FALSE` y `serverAuth`.** Firefox rechaza un certificado de CA usado
  como certificado de servidor. Como el certificado de OpenSSL lleva
  `CA:TRUE` por defecto, se sobrescribe.
- **`-nodes`.** La clave privada se guarda sin cifrar para que el servidor
  arranque sin pedir frase de paso. Se protege con los permisos del fichero
  (`0600` en Linux) y no se versiona. Cifrarla con una frase de paso queda
  como mejora.
- **365 días.** Los navegadores limitan la validez de los certificados.

### D3. Script de generación en Node que llama a OpenSSL

`npm run cert` (en el `package.json` raíz) ejecuta
`node scripts/generar-certificados.mjs`. El script:

1. Comprueba que existe `openssl` (`openssl version`). Si no, termina con
   código 1 y explica cómo instalarlo:
   - Linux: `sudo apt install openssl`.
   - Windows: Git for Windows (`C:\Program Files\Git\usr\bin\openssl.exe`) o
     `winget install ShiningLight.OpenSSL.Light`.
2. Para cada destino (`server/certs`, `client/certs`): si ya existe
   `cert.pem` y no se ha pasado `--force`, lo deja como está y avisa. Si no,
   crea el directorio y ejecuta el comando de D2 con
   `child_process.spawnSync('openssl', [...args])`.
3. En Linux, pone permisos `0600` a `key.pem`.
4. Muestra la huella SHA-256 de cada certificado
   (`openssl x509 -noout -fingerprint -sha256`), para poder comprobar en el
   navegador que es el certificado correcto.

Se usa `spawnSync` con una lista de argumentos, sin pasar por una shell. Así
se evitan problemas de comillas en Windows y la conversión de `/CN=…` en una
ruta que hace Git Bash (MSYS).

*Alternativa descartada:* el paquete npm `selfsigned` (propuesto en el D6 de
la fase 1). Evita depender de OpenSSL, pero las anotaciones de clase piden
usar OpenSSL, y así el proceso se puede explicar en la memoria con los mismos
comandos.

### D4. Servidor HTTPS en `server/index.js`

- `loadConfig` añade `tlsCertFile` y `tlsKeyFile`, que se leen de
  `TLS_CERT_FILE` y `TLS_KEY_FILE`. Si no están definidas, se usan las rutas
  de `server/certs/`, resueltas respecto a `server/` y no respecto al
  directorio de trabajo.
- Nuevo módulo `server/src/infrastructure/http/https-server.js` con la
  función `createHttpsServer({ app, certFile, keyFile })`:
  - lee los dos ficheros;
  - si falta alguno, lanza un `Error` que nombra el fichero y dice que se
    ejecute `npm run cert`;
  - crea el servidor con `https.createServer({ cert, key }, app)`. Node
    comprueba que la clave corresponde al certificado y lanza un error si no.
- `index.js` llama a `createHttpsServer` y a `listen`. Si hay un error,
  escribe el mensaje y sale con `process.exit(1)`. No hay ninguna rama HTTP.
- Una petición HTTP en claro al puerto HTTPS falla en el handshake TLS
  (probado: el cliente recibe `ECONNRESET`), así que no llega a Express.

### D5. Vite por HTTPS y proxy que verifica

En `client/vite.config.js`:

- `server.https = { cert, key }`, leídos de `client/certs/`. Si no existen,
  se lanza un `Error` con el mensaje de `npm run cert` y Vite no arranca.
- El proxy de `/api` recibe como `target` el objeto
  `{ protocol: 'https:', host: 'localhost', port: 3000, ca: <server/certs/cert.pem> }`
  y `secure: true`. En Vite 7.3, el proxy copia `ca` del `target` a la
  petición saliente (`setupOutgoing`), así que verifica el certificado del
  servidor con esa única autoridad de confianza.
- `changeOrigin: true` para que el nombre del servidor TLS (SNI) sea
  `localhost`.

*Alternativa descartada:* `secure: false`. Desactiva la verificación y
anularía el objetivo del paso.

### D6. Pruebas

- Las pruebas de integración actuales siguen probando la aplicación Express
  por HTTP dentro del mismo proceso (`createApp(...).listen(0)`). Lo que
  prueban es la lógica de la API, que no depende del transporte. Así no hace
  falta cambiar `fetch` en todas ellas para que confíe en un certificado
  autofirmado.
- Nueva prueba `server/test/https-server.test.js` con un certificado de
  prueba en `server/test/fixtures/` (solo para pruebas, marcado así en un
  `README`). Usa `node:https` con `ca` para comprobar:
  - `GET /api/health` por HTTPS responde `200`;
  - sin `ca`, el cliente rechaza la conexión;
  - una petición HTTP en claro no recibe respuesta de la API;
  - si falta un fichero o la clave no corresponde, `createHttpsServer` lanza
    el error con `npm run cert`.
- `config.test.js` añade los valores por defecto y la lectura de
  `TLS_CERT_FILE` y `TLS_KEY_FILE`.
- La configuración de Vite se comprueba a mano: abrir
  `https://localhost:5173`, ver el certificado del cliente en el navegador e
  iniciar sesión.

## Risks / Trade-offs

- **[Aviso del navegador ante un certificado autofirmado]** → El manual
  explica cómo aceptar la excepción o importar `client/certs/cert.pem` en el
  almacén de confianza del sistema o del navegador. También explica cómo
  comprobar la huella SHA-256.
- **[OpenSSL no está instalado en Windows]** → El script lo detecta y explica
  cómo instalarlo. El README lo incluye en los requisitos.
- **[La clave privada se guarda sin cifrar]** → Permisos `0600`, fuera de git.
  Cifrarla queda como mejora documentada.
- **[El certificado de prueba se versiona]** → Solo lo usan las pruebas y está
  marcado como tal. No se usa nunca al arrancar.
- **[El certificado caduca a los 365 días]** → `npm run cert -- --force` lo
  regenera. El servidor muestra el error de TLS y el manual lo explica.
- **[Vite escucha en `0.0.0.0`]** → Desde otra máquina se accedería con otro
  nombre que no está en el SAN, y el navegador avisaría. Se documenta. No se
  cambia el `--host` actual.
- **[Ruptura del flujo de desarrollo actual]** → `npm run dev` deja de
  arrancar hasta ejecutar `npm run cert`. El README lo pone como paso
  obligatorio de la puesta en marcha.

## Migration Plan

1. `git pull` y `npm run cert`.
2. `npm run dev` y abrir `https://localhost:5173`.
3. Para volver atrás, basta con revertir el cambio. Los directorios
   `certs/` se pueden borrar.

## Open Questions

- ¿RSA 2048, RSA 3072 o ECDSA P-256? (lo decide el equipo; la propuesta es
  RSA 2048).
- ¿Se quiere, además, **autenticación mutua TLS**? El proxy de Vite
  presentaría el certificado del cliente al servidor (`target.cert` y
  `target.key`), y el servidor exigiría `requestCert` con ese certificado
  como `ca`. Solo protege el tramo Vite ↔ API en desarrollo, así que de
  momento queda fuera de alcance.
