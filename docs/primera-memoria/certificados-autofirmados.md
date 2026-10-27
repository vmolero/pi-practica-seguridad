# Certificados autofirmados: creación, instalación y uso

> **Paso 6** (`openspec/changes/paso-6-https-autofirmado`). Los comandos de
> este documento se han probado con OpenSSL 3.0.13. El script de generación
> es `scripts/generar-certificados.mjs`. El arranque HTTPS del servidor está
> en `server/src/infrastructure/http/https-server.js` y el del cliente en
> `client/vite.config.js`.

## 1. Para qué sirven

Sin cifrar el canal, la contraseña del login, el token de sesión y los datos
de las tarjetas viajan en claro. Cualquiera que observe la red los puede
leer. Con HTTPS (HTTP sobre TLS), todo el tráfico entre el navegador, el
cliente y el servidor va cifrado, y cada parte puede comprobar con quién
habla.

La aplicación tiene dos tramos de red. Cada uno lo protege un certificado
distinto:

```
Navegador ──HTTPS──► Cliente (Vite, https://localhost:5173)
                     certificado del CLIENTE: client/certs/cert.pem
                          │
                          │ proxy /api
                          ▼
                     ──HTTPS──► Servidor (API, https://localhost:3000)
                                certificado del SERVIDOR: server/certs/cert.pem
```

- El **certificado del cliente** es el que ve el navegador al abrir la
  aplicación.
- El **certificado del servidor** es el que presenta la API. El proxy de
  Vite lo verifica antes de enviarle ninguna petición.

Cliente y servidor tienen **cada uno su propio par de claves**. Si se filtra
la clave privada de uno, no compromete al otro.

## 2. Qué es un certificado autofirmado

Con la notación del tema 4, cada parte X tiene un par de claves RSA: la clave
pública `K_X = (n, e)` y la clave privada `k_X = d`. Un certificado X.509
asocia la clave pública con una identidad (aquí, `localhost`) y va firmado.

- En un certificado normal lo firma una autoridad de certificación (CA) en
  la que el navegador ya confía.
- En un certificado **autofirmado** lo firma la propia parte X con su clave
  privada `k_X`. El emisor (`Issuer`) y el sujeto (`Subject`) coinciden.

Nadie de confianza respalda un certificado autofirmado. Por eso el navegador
avisa la primera vez, y hay que decirle explícitamente que confíe en él
(apartado 5). A cambio, no hace falta ninguna CA externa, y para un entorno
de desarrollo o de práctica es suficiente.

Durante la conexión TLS, el servidor demuestra que tiene `k_X` sin enviarla.
Después cliente y servidor acuerdan claves simétricas de sesión con las que
cifran el tráfico (con AES, por ejemplo). Es el mismo esquema híbrido del
tema 4: la criptografía asimétrica solo sirve para autenticar y acordar la
clave de sesión.

## 3. Parámetros elegidos

| Parámetro | Valor | Motivo |
|---|---|---|
| Algoritmo de clave pública | RSA 2048 bits | Es el algoritmo del tema 4 y 2048 bits es el tamaño mínimo aceptado hoy. *Pendiente de confirmar por el equipo.* |
| Función resumen de la firma | SHA-256 | La firma del certificado es `sha256WithRSAEncryption`. |
| Validez | 365 días | Los navegadores limitan la validez de los certificados. |
| Nombres (`subjectAltName`) | `localhost`, `127.0.0.1` y `::1` | Los navegadores solo comprueban el SAN, no el `CN`. |
| `basicConstraints` | `critical, CA:FALSE` | Es un certificado final, no una CA. Firefox rechaza una CA usada como certificado de servidor. |
| `keyUsage` | `critical, digitalSignature, keyEncipherment` | Los usos que necesita TLS con RSA. |
| `extendedKeyUsage` | `serverAuth` | Solo sirve para identificar un servidor TLS. |
| Sujeto | `CN=localhost, O=Tarjetas de empresa, OU=API` (servidor) y `OU=Cliente web` (cliente) | El `OU` distingue los dos certificados. |
| Clave privada | Sin cifrar (`-nodes`), con permisos `0600` | El servidor arranca sin pedir frase de paso. Cifrarla es una mejora pendiente. |

## 4. Creación de los certificados

### 4.1 Requisito: OpenSSL

Comprueba si OpenSSL está instalado:

```bash
openssl version
```

Si no lo está:

- **Linux (Debian/Ubuntu):** `sudo apt install openssl`.
- **Windows:** viene con Git for Windows
  (`C:\Program Files\Git\usr\bin\openssl.exe`), así que funciona desde Git
  Bash. También se puede instalar con
  `winget install ShiningLight.OpenSSL.Light` y usarlo desde PowerShell.

### 4.2 Con el comando del proyecto

Desde la raíz del proyecto:

```bash
npm run cert
```

El comando genera los dos certificados y muestra la huella SHA-256 de cada
uno:

```
Certificado del servidor (API) generado en server/certs/cert.pem
  sha256 Fingerprint=9C:EC:A3:…:F9:94
Certificado del cliente (Vite) generado en client/certs/cert.pem
  sha256 Fingerprint=0D:30:DE:…:8C:76
```

Las huellas son distintas en cada máquina y cada vez que se generan.
En Linux y macOS, el script deja las claves privadas con permisos `0600`.
Si los certificados ya existen, no los toca:

```
Certificado del servidor (API): ya existe server/certs/cert.pem, no se modifica (usa --force para regenerarlo).
```

Para regenerarlos, por ejemplo cuando caducan:

```bash
npm run cert -- --force
```

### 4.3 A mano con OpenSSL

Hace lo mismo que `npm run cert`. Sirve para entender cada paso o si el
script no está disponible.

**Linux o macOS:**

```bash
# Certificado del servidor (API)
mkdir -p server/certs
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout server/certs/key.pem -out server/certs/cert.pem \
  -subj "/CN=localhost/O=Tarjetas de empresa/OU=API" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
chmod 600 server/certs/key.pem

# Certificado del cliente (Vite)
mkdir -p client/certs
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout client/certs/key.pem -out client/certs/cert.pem \
  -subj "/CN=localhost/O=Tarjetas de empresa/OU=Cliente web" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
chmod 600 client/certs/key.pem
```

**Windows (PowerShell):** cambia `\` por `` ` `` al final de cada línea y
`mkdir -p` por `New-Item -ItemType Directory -Force`. No hace falta `chmod`.

**Windows (Git Bash):** antepón `MSYS_NO_PATHCONV=1` a cada `openssl req`.
Si no, Git Bash convierte `/CN=localhost/...` en una ruta de Windows y el
comando falla.

Qué hace cada opción de `openssl req`:

| Opción | Significado |
|---|---|
| `-x509` | Genera directamente un certificado autofirmado, en lugar de una petición de firma (CSR) para una CA. |
| `-newkey rsa:2048` | Genera a la vez un par de claves RSA nuevo de 2048 bits: elige los primos `p` y `q` y calcula `n`, `e` y `d`. |
| `-sha256` | Firma el certificado con SHA-256 y RSA. |
| `-days 365` | El certificado es válido durante un año. |
| `-nodes` | No cifra la clave privada ("no DES"). |
| `-keyout` / `-out` | Dónde guardar la clave privada y el certificado (formato PEM). |
| `-subj` | Sujeto del certificado sin preguntar en la consola. |
| `-addext` | Añade las extensiones X.509 del apartado 3. |

### 4.4 Comprobación

Ver el contenido del certificado:

```bash
openssl x509 -in server/certs/cert.pem -noout -subject -issuer -dates \
  -ext subjectAltName,basicConstraints,extendedKeyUsage
```

Debe mostrar que el `subject` y el `issuer` coinciden (es autofirmado), las
fechas de validez, los tres nombres del SAN, `CA:FALSE` y
`TLS Web Server Authentication`.

Comprobar que la clave privada corresponde al certificado (las dos líneas
deben ser iguales):

```bash
openssl x509 -in server/certs/cert.pem -noout -pubkey | openssl sha256
openssl pkey -in server/certs/key.pem -pubout | openssl sha256
```

Comprobar que cliente y servidor tienen claves distintas (las dos líneas
deben ser diferentes):

```bash
openssl x509 -in server/certs/cert.pem -noout -pubkey | openssl sha256
openssl x509 -in client/certs/cert.pem -noout -pubkey | openssl sha256
```

Obtener la huella SHA-256, que sirve para reconocer el certificado en el
navegador:

```bash
openssl x509 -in client/certs/cert.pem -noout -fingerprint -sha256
```

## 5. Instalación

### 5.1 Dónde quedan los ficheros

| Fichero | Contenido | ¿Secreto? |
|---|---|---|
| `server/certs/cert.pem` | Certificado del servidor (incluye su clave pública). | No |
| `server/certs/key.pem` | Clave privada del servidor. | **Sí** |
| `client/certs/cert.pem` | Certificado del cliente. | No |
| `client/certs/key.pem` | Clave privada del cliente. | **Sí** |

Los dos directorios `certs/` están en `.gitignore`: **nunca se suben al
repositorio**. Cada persona genera los suyos en su máquina. Las claves
privadas no se copian ni se envían a nadie.

### 5.2 Hacer que el navegador confíe en el certificado del cliente

El navegador solo ve el certificado del cliente (el de
`https://localhost:5173`). El del servidor solo lo usa el proxy de Vite, que
ya lo tiene configurado.

Hay dos opciones:

**Opción A: aceptar la excepción (más rápido).** La primera vez que abras
`https://localhost:5173` el navegador avisará de que la conexión no es
privada.

1. Comprueba la huella del certificado: pulsa el aviso o el icono del
   candado, luego «El certificado no es válido» o «Ver certificado», y
   compara la huella SHA-256 con la del apartado 4.4.
2. Si coincide, pulsa «Configuración avanzada» y después «Acceder a
   localhost (sitio no seguro)». En Firefox es «Avanzado…» y después
   «Aceptar el riesgo y continuar».

**Opción B: importar el certificado (sin avisos).**

- **Windows (Chrome y Edge):** abre `client/certs/cert.pem` con doble clic,
  pulsa «Instalar certificado…», elige «Usuario actual» y colócalo en
  «Entidades de certificación raíz de confianza».
- **Linux (Chrome y Chromium):** en `chrome://certificate-manager`, ve a
  «Certificados locales» → «Personalizado» → «Importar», y elige
  `client/certs/cert.pem`.
- **Firefox:** usa la opción A. Firefox guarda la excepción para ese
  certificado.

Reinicia el navegador después de importar. Si regeneras el certificado, hay
que volver a importarlo, porque es un certificado nuevo con otra clave.

## 6. Uso

### 6.1 Arrancar la aplicación

```bash
npm run cert   # solo la primera vez o al regenerar
npm run dev
```

Abre `https://localhost:5173`. La aplicación funciona igual que antes, pero
ahora:

- el candado del navegador indica una conexión cifrada con el certificado
  `OU=Cliente web`;
- el proxy de Vite envía `/api` a `https://localhost:3000` y verifica el
  certificado `OU=API` con `server/certs/cert.pem` como única autoridad de
  confianza. Si el servidor presentara otro certificado, el proxy rechazaría
  la conexión.

Si falta algún certificado, el cliente o el servidor **no arrancan** y
muestran un mensaje que pide ejecutar `npm run cert`. Nunca vuelven a HTTP.
Por ejemplo, el servidor:

```
No se puede leer el certificado del servidor (…/server/certs/cert.pem): ENOENT. Genera el certificado con "npm run cert" desde la raíz del proyecto.
```

Cuando arranca bien, el servidor escribe
`API server listening at https://localhost:3000`, y Vite muestra
`Local: https://localhost:5173/`.

### 6.2 Usar la API con `curl`

Hay que decirle a `curl` que confíe en el certificado del servidor:

```bash
curl --cacert server/certs/cert.pem https://localhost:3000/api/health
```

Sin `--cacert`, `curl` rechaza la conexión («self-signed certificate»). Una
petición por `http://localhost:3000` no recibe respuesta: el servidor no
atiende HTTP.

### 6.3 Usar otros certificados

El servidor admite otras rutas con variables de entorno:

```bash
TLS_CERT_FILE=/ruta/cert.pem TLS_KEY_FILE=/ruta/key.pem npm run start:server
```

## 7. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `openssl: command not found` | OpenSSL no está instalado o no está en el `PATH`. | Apartado 4.1. |
| En Git Bash, `subject name is expected to be in the format /type0=value0...` | Git Bash ha convertido `/CN=...` en una ruta. | Usa `MSYS_NO_PATHCONV=1` o `npm run cert`. |
| El cliente o el servidor no arrancan y piden `npm run cert` | Faltan los certificados. | `npm run cert`. |
| El servidor no arranca y dice `key values mismatch` | `TLS_KEY_FILE` no es la clave de `TLS_CERT_FILE`. | Usa la pareja correcta o `npm run cert -- --force`. |
| `NET::ERR_CERT_AUTHORITY_INVALID` en el navegador | El navegador no confía en el certificado del cliente. | Apartado 5.2. |
| `NET::ERR_CERT_DATE_INVALID` | El certificado ha caducado (365 días). | `npm run cert -- --force` y volver a importarlo. |
| Las peticiones a `/api` responden `500` y Vite muestra `http proxy error … self-signed certificate` | El servidor usa un certificado distinto de `server/certs/cert.pem`, o se regeneró uno de los dos sin reiniciar el otro. | Regenera los certificados o arranca el servidor con los de `server/certs/`. |
| Aviso de nombre no válido al entrar desde otra máquina | El certificado solo incluye `localhost`, `127.0.0.1` y `::1`. | Usa la aplicación desde la misma máquina. |

## 8. Limitaciones y mejoras

- **Autofirmado:** la confianza depende de que cada usuario compruebe la
  huella o importe el certificado. En producción habría que usar un
  certificado de una CA reconocida.
- **Clave privada sin cifrar:** la protegen los permisos del fichero.
  Mejora: cifrarla con una frase de paso.
- **Sin autenticación mutua:** el servidor no comprueba el certificado del
  cliente. Mejora: TLS mutuo entre el proxy y la API.
- **Sin HSTS ni otras cabeceras de seguridad:** quedan para otro paso de la
  fase 1.
