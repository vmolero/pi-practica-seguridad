## ADDED Requirements

### Requirement: Generación de los certificados autofirmados con OpenSSL
El proyecto SHALL ofrecer el comando `npm run cert`, que usa OpenSSL para
generar **dos** pares de claves y **dos** certificados X.509 autofirmados
independientes:

- el del servidor (la API), en `server/certs/cert.pem` y `server/certs/key.pem`;
- el del cliente (el servidor de desarrollo de Vite), en
  `client/certs/cert.pem` y `client/certs/key.pem`.

Cada certificado SHALL:

- tener su propia clave privada, que no se comparte con el otro;
- incluir en `subjectAltName` los nombres `localhost`, `127.0.0.1` y `::1`;
- llevar en el sujeto un campo que distinga si es del cliente o del servidor;
- estar firmado con SHA-256;
- marcarse como certificado final (`basicConstraints = CA:FALSE`) de uso
  exclusivo para servidores TLS (`extendedKeyUsage = serverAuth`);
- tener una validez limitada (365 días).

`server/certs/` y `client/certs/` SHALL estar en `.gitignore`. El comando NO
SHALL sobrescribir un certificado existente salvo que se le pase `--force`.
Si OpenSSL no está disponible, el comando SHALL terminar con un error que
explique cómo instalarlo en Linux y en Windows.

#### Scenario: Primera generación
- **WHEN** se ejecuta `npm run cert` y no existe ninguno de los dos certificados
- **THEN** se crean `server/certs/cert.pem`, `server/certs/key.pem`, `client/certs/cert.pem` y `client/certs/key.pem`, y los dos certificados muestran en `subjectAltName` los nombres `localhost`, `127.0.0.1` y `::1`

#### Scenario: Las claves son distintas
- **WHEN** se comparan las claves públicas de `server/certs/cert.pem` y `client/certs/cert.pem`
- **THEN** son diferentes

#### Scenario: Ya existen los certificados
- **WHEN** se ejecuta `npm run cert` y ya existe un certificado
- **THEN** el comando no modifica ese certificado ni su clave, y avisa de que hay que usar `--force` para regenerarlo

#### Scenario: Regenerar a propósito
- **WHEN** se ejecuta `npm run cert -- --force` con los certificados existentes
- **THEN** se generan claves y certificados nuevos que sustituyen a los anteriores

#### Scenario: OpenSSL no está instalado
- **WHEN** se ejecuta `npm run cert` en un sistema sin el ejecutable `openssl`
- **THEN** el comando termina con un código distinto de 0 y un mensaje que indica cómo instalar OpenSSL en Linux y en Windows

#### Scenario: Los certificados no se versionan
- **WHEN** se ejecuta `git status` después de generar los certificados
- **THEN** los ficheros de `server/certs/` y `client/certs/` no aparecen como ficheros nuevos

### Requirement: El servidor solo atiende por HTTPS
El servidor SHALL servir la API únicamente por HTTPS, con su propio
certificado y su clave, y NO SHALL abrir ningún puerto HTTP. Una conexión
HTTP en claro al puerto del servidor NO SHALL recibir ninguna respuesta de la
API.

#### Scenario: Petición por HTTPS
- **WHEN** un cliente que confía en el certificado del servidor envía `GET https://localhost:3000/api/health`
- **THEN** el servidor responde `200`

#### Scenario: Petición por HTTP en claro
- **WHEN** un cliente envía `GET http://localhost:3000/api/health`
- **THEN** la conexión se cierra sin ninguna respuesta de la API

#### Scenario: Cliente que no confía en el certificado
- **WHEN** un cliente sin el certificado del servidor entre sus autoridades de confianza se conecta a `https://localhost:3000`
- **THEN** el cliente rechaza la conexión por no poder verificar el certificado del servidor

### Requirement: El servidor no arranca sin un certificado válido
Al arrancar, el servidor SHALL leer su certificado y su clave de las rutas
`TLS_CERT_FILE` y `TLS_KEY_FILE`. Si esas variables no están definidas, SHALL
usar `server/certs/cert.pem` y `server/certs/key.pem`. Si algún fichero no
existe, no se puede leer o la clave no corresponde al certificado, el
servidor NO SHALL arrancar: SHALL terminar con un código distinto de 0 y un
mensaje que indique el fichero afectado y que se ejecute `npm run cert`. El
servidor NO SHALL caer en ningún caso a HTTP.

#### Scenario: Faltan los ficheros
- **WHEN** se arranca el servidor y no existe `server/certs/cert.pem`
- **THEN** el proceso termina con un código distinto de 0, no escucha en ningún puerto y el mensaje menciona `npm run cert`

#### Scenario: Rutas personalizadas
- **WHEN** se arranca el servidor con `TLS_CERT_FILE` y `TLS_KEY_FILE` apuntando a otro certificado válido
- **THEN** el servidor usa ese certificado

#### Scenario: La clave no corresponde al certificado
- **WHEN** se arranca el servidor con un `TLS_KEY_FILE` que no es la clave del certificado
- **THEN** el proceso termina con un código distinto de 0 y no escucha en ningún puerto

### Requirement: El cliente solo se sirve por HTTPS con su propio certificado
El servidor de desarrollo de Vite SHALL servir la interfaz únicamente por
HTTPS, con el certificado y la clave de `client/certs/`, distintos de los del
servidor. Si faltan, Vite NO SHALL arrancar y SHALL indicar que se ejecute
`npm run cert`. En ningún caso SHALL caer a HTTP.

#### Scenario: Abrir la aplicación
- **WHEN** se ejecuta `npm run dev` y se abre `https://localhost:5173`
- **THEN** la interfaz se carga por HTTPS y el navegador recibe el certificado del cliente, no el del servidor

#### Scenario: Falta el certificado del cliente
- **WHEN** se arranca el cliente y no existe `client/certs/cert.pem`
- **THEN** Vite no arranca y el mensaje menciona `npm run cert`

### Requirement: El proxy verifica el certificado del servidor
El proxy de `/api` de Vite SHALL conectarse al servidor por HTTPS y SHALL
verificar su certificado usando `server/certs/cert.pem` como única autoridad
de confianza. NO SHALL desactivar la verificación (`secure: false` ni
`NODE_TLS_REJECT_UNAUTHORIZED=0`).

#### Scenario: Login a través del proxy
- **WHEN** con cliente y servidor en marcha se inicia sesión en `https://localhost:5173`
- **THEN** la petición llega a la API por HTTPS y el login funciona

#### Scenario: El servidor presenta otro certificado
- **WHEN** el servidor arranca con un certificado distinto de `server/certs/cert.pem`
- **THEN** las peticiones a `/api` a través del proxy fallan en lugar de enviarse sin verificar
