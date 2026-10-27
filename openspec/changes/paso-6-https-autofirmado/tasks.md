# Tareas

Este paso configura el canal (infraestructura): las tareas de código son
[claude]. El equipo decide y justifica los parámetros criptográficos de los
certificados ([equipo]) y revisa el resultado.

## 1. Decisión de parámetros

- [x] 1.1 [equipo] Confirmar o cambiar los parámetros de `design.md` D2: algoritmo y tamaño de clave (RSA 2048, RSA 3072 o ECDSA P-256), SHA-256, 365 días de validez y extensiones (`subjectAltName`, `CA:FALSE`, `keyUsage` y `extendedKeyUsage`)
- [x] 1.2 [equipo] Decidir si se añade autenticación mutua TLS (pregunta abierta de `design.md`). Si se añade, se crea un cambio aparte

## 2. Generación de los certificados

- [x] 2.1 [claude] Añadir `server/certs/` y `client/certs/` a `.gitignore`
- [x] 2.2 [claude] Crear `scripts/generar-certificados.mjs` según `design.md` D3: comprobar `openssl version` (mensaje con la instalación en Linux y en Windows si falta); generar con `spawnSync`, sin shell, el certificado del servidor (`OU=API`) en `server/certs/` y el del cliente (`OU=Cliente web`) en `client/certs/`, con los parámetros de 1.1; no sobrescribir sin `--force`; permisos `0600` en `key.pem` fuera de Windows; mostrar la huella SHA-256 de cada certificado
- [x] 2.3 [claude] Añadir el script `"cert": "node scripts/generar-certificados.mjs"` al `package.json` raíz
- [x] 2.4 [claude] Comprobar a mano los escenarios del requisito de generación: primera generación, claves públicas distintas (`openssl x509 -noout -pubkey`), segunda ejecución sin `--force` (no cambia nada), `--force` (regenera), `PATH` sin `openssl` (error con instrucciones) y `git status` limpio

## 3. Servidor HTTPS

- [x] 3.1 [claude] Ampliar `loadConfig` en `server/src/config.js` con `tlsCertFile` y `tlsKeyFile` (`TLS_CERT_FILE` y `TLS_KEY_FILE`; por defecto `server/certs/cert.pem` y `server/certs/key.pem`, resueltas respecto a `server/`) y cubrirlo en `server/test/config.test.js`
- [x] 3.2 [claude] Crear `server/src/infrastructure/http/https-server.js` con `createHttpsServer({ app, certFile, keyFile })` según `design.md` D4: error con el nombre del fichero y `npm run cert` si falta alguno; error si la clave no corresponde al certificado
- [x] 3.3 [claude] Cambiar `server/index.js` para arrancar solo el servidor HTTPS, escribir `API server listening at https://localhost:<puerto>` y salir con código 1 y el mensaje del error si no se puede crear; sin ninguna rama HTTP
- [x] 3.4 [claude] Generar un certificado de prueba en `server/test/fixtures/` (con un `README.md` que diga que solo sirve para las pruebas) y crear `server/test/https-server.test.js`: `200` en `/api/health` por HTTPS con `ca`; rechazo sin `ca`; una petición HTTP en claro no recibe respuesta de la API; fichero inexistente → error que menciona `npm run cert`; clave que no corresponde → error
- [x] 3.5 [claude] Ejecutar `npm test --workspace=server` y comprobar que pasa entero
- [x] 3.6 [claude] Comprobar a mano que `npm run start:server` sin certificados termina con código distinto de 0 y no escucha en el puerto 3000

## 4. Cliente HTTPS y proxy

- [x] 4.1 [claude] Cambiar `client/vite.config.js` según `design.md` D5: `server.https` con `client/certs/cert.pem` y `key.pem` (error con `npm run cert` si faltan) y proxy de `/api` con `target` `{ protocol: 'https:', host: 'localhost', port: 3000, ca: server/certs/cert.pem }`, `secure: true` y `changeOrigin: true`
- [x] 4.2 [claude] Comprobar en el navegador: `https://localhost:5173` carga y muestra el certificado `OU=Cliente web`, y el login, el panel de tarjetas y el panel de administración funcionan
- [x] 4.3 [claude] Comprobar que, si el servidor arranca con otro certificado (`TLS_CERT_FILE` y `TLS_KEY_FILE` apuntando al de `server/test/fixtures/`), las peticiones a `/api` a través del proxy fallan
- [x] 4.4 [claude] Comprobar que, sin `client/certs/`, el cliente no arranca y el mensaje menciona `npm run cert`

## 5. Documentación

- [x] 5.1 [claude] Actualizar `README.md`: requisito de OpenSSL, paso `npm run cert` en la puesta en marcha, URL `https://`, variables `TLS_CERT_FILE` y `TLS_KEY_FILE` en la tabla de entorno, y todos los ejemplos de `curl` con `https://localhost:3000` y `--cacert server/certs/cert.pem`
- [x] 5.2 [claude] Actualizar `docs/primera-memoria/certificados-autofirmados.md` para que coincida con lo implementado (comando, rutas, mensajes y huellas)
- [x] 5.3 [equipo] Añadir a `docs/primera-memoria/implementacion-y-seguridad.md` la sección «Cifrado del canal», con la justificación de los parámetros de 1.1 en la notación de la asignatura, y quitar «Sin HTTPS…» de los riesgos y «Cifrar el canal (HTTPS)» de las mejoras pendientes
- [x] 5.4 [claude] Actualizar `docs/primera-memoria/manual-de-usuario.md`: generar los certificados, aceptar o importar el certificado del cliente en el navegador y comprobar su huella
- [x] 5.5 [claude] Añadir OpenSSL a `docs/primera-memoria/stack-tecnologico.md`
- [ ] 5.6 [equipo] Revisar el cambio completo antes de archivarlo
