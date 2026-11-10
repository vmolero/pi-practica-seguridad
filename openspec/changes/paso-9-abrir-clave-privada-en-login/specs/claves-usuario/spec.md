# Spec Delta

Sobre la versión de `claves-usuario-en-alta`.

## ADDED Requirements

### Requirement: Claves del usuario abiertas solo en memoria
El cliente SHALL conservar `K_U` y `k_U`, una vez abiertas en el login, solo
en memoria y como objetos `CryptoKey` de Web Crypto no exportables
(`extractable: false`), con usos `encrypt` para `K_U` y `decrypt` para `k_U`.
SHALL NOT escribirlas en `localStorage`, `sessionStorage`, cookies ni
IndexedDB, y SHALL destruir las referencias al cerrar sesión, al caducar la
sesión o al fallar la apertura. `K_D` SHALL borrarse de la memoria en cuanto
`k_U` esté abierta y comprobada.

#### Scenario: Claves no exportables
- **WHEN** el usuario tiene la sesión iniciada
- **THEN** `getUserKeys()` devuelve `{ publicKey, privateKey }` con `privateKey.extractable === false`
- **AND** `getDataKey()` devuelve `null`

#### Scenario: Cierre de sesión destruye las claves
- **WHEN** el usuario cierra sesión o la sección privada responde `401`
- **THEN** `getUserKeys()` devuelve `null`

## MODIFIED Requirements

### Requirement: Generación del par de claves en el navegador
El cliente SHALL generar el par de claves del usuario en el navegador, sin
enviar `pw`, `K_D` ni `k_U` al servidor:
1. `h = SHA3-256(pw)`, de 256 bits, sobre la codificación UTF-8 de `pw`.
2. `K_D = h[128..255]`, los 128 bits bajos de `h`.
3. Par RSA-OAEP con módulo de 2048 bits, `e = 65537` y SHA-256: `K_U` es la
   clave pública y `k_U` la privada.
4. `VI`: 16 bytes de un generador aleatorio criptográfico, distinto en cada
   alta.
5. `c_kU = E_K_D(k_U)`: AES-128-CBC sobre la clave privada exportada en PKCS#8.

El módulo SHALL devolver `{ publicKey, encryptedPrivateKey, privateKeyIv }` en
base64 y SHALL ofrecer la operación inversa: con `pw` o con `K_D` y
`{ encryptedPrivateKey, privateKeyIv }`, recuperar `k_U` como `CryptoKey` no
exportable. El módulo SHALL ofrecer además `comprobarParDeClaves(K_U, k_U)`,
que cifra un valor aleatorio `r` de 32 bytes con `K_U` mediante RSA-OAEP, lo
descifra con `k_U` y devuelve `true` solo si el resultado es `r`.

#### Scenario: Ida y vuelta con la contraseña correcta
- **WHEN** se generan las claves con `pw = "inicial123"` y después se abre `encryptedPrivateKey` con la misma `pw` y el mismo `privateKeyIv`
- **THEN** se obtiene una clave privada que descifra lo que se cifra con `publicKey` mediante RSA-OAEP

#### Scenario: Apertura con la clave de datos
- **WHEN** se abre `encryptedPrivateKey` con la `K_D` derivada de la contraseña correcta en lugar de con la contraseña
- **THEN** se obtiene la misma clave privada y `comprobarParDeClaves` devuelve `true`

#### Scenario: Contraseña incorrecta
- **WHEN** se intenta abrir `encryptedPrivateKey` con una contraseña distinta de la usada al generarla
- **THEN** la operación falla y no devuelve ninguna clave privada

#### Scenario: Par de claves que no se corresponden
- **WHEN** se llama a `comprobarParDeClaves` con la clave pública de un usuario y la clave privada de otro
- **THEN** devuelve `false` sin lanzar ninguna excepción

#### Scenario: VI distinto en cada alta
- **WHEN** se generan dos veces las claves con la misma contraseña
- **THEN** los dos `privateKeyIv` son distintos y las dos `publicKey` también

#### Scenario: El servidor no recibe secretos
- **WHEN** el panel envía el alta de un usuario
- **THEN** el cuerpo de la petición contiene `publicKey`, `encryptedPrivateKey` y `privateKeyIv`, pero no `K_D` ni la clave privada en claro

### Requirement: La clave privada cifrada no sale del servidor por la API de administración
El servidor SHALL guardar `publicKey`, `encryptedPrivateKey` y `privateKeyIv`
tal y como los recibe en un alta válida. Ninguna respuesta de
`/api/private/admin/users` SHALL incluir ninguno de los tres campos. La única
vía por la que salen del servidor SHALL ser la respuesta `200` de
`POST /api/public/login` al propio usuario, una vez verificada su clave de
login, según `autenticacion`.

#### Scenario: Alta guarda las claves
- **WHEN** un administrador da de alta un usuario con campos de clave válidos
- **THEN** la fila del usuario en `USER` contiene exactamente los tres valores enviados

#### Scenario: Respuestas de administración sin material de claves
- **WHEN** un administrador lista los usuarios o da de alta uno
- **THEN** cada usuario de la respuesta contiene solo `id`, `name`, `email` e `isAdmin`

#### Scenario: Solo el propio usuario recibe sus claves
- **WHEN** un usuario inicia sesión con su clave de login correcta
- **THEN** recibe sus propios `publicKey`, `privateKeyIv` y `encryptedPrivateKey`, y ningún endpoint devuelve los de otro usuario
