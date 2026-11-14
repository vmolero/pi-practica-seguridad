# Spec Delta

## Purpose

Define cómo cifra el navegador los datos de cada tarjeta con una clave propia
gestionada con las claves asimétricas del usuario, de modo que el servidor
guarde y devuelva solo texto cifrado que no puede abrir, y cómo detecta el
navegador cualquier manipulación.

## ADDED Requirements

### Requirement: Clave aleatoria por tarjeta envuelta con la clave pública del usuario
El cliente SHALL generar para cada tarjeta nueva una clave `K_t` de 256 bits
con el generador aleatorio criptográfico del navegador y SHALL envolverla
como `w_U = E_K_U(K_t)` con RSA-OAEP (SHA-256) usando la clave pública `K_U`
del usuario abierta en el login. `K_t` SHALL existir en claro solo en la
memoria del navegador, como `CryptoKey` no exportable, y SHALL enviarse al
servidor únicamente envuelta. Con `k_U` el cliente SHALL poder recuperar
`K_t` a partir de `w_U`.

#### Scenario: Dos tarjetas con los mismos datos
- **WHEN** el usuario guarda dos tarjetas con el mismo número, caducidad y CVV
- **THEN** sus valores cifrados y sus claves envueltas son distintos

#### Scenario: La clave envuelta solo la abre el propietario
- **WHEN** se intenta abrir `w_U` con la clave privada de otro usuario
- **THEN** la operación falla y no se obtiene ninguna clave de tarjeta

### Requirement: Cifrado autenticado de cada valor
El cliente SHALL cifrar por separado el número, la caducidad (`MM/AAAA`) y el
CVV con AES-256-GCM bajo `K_t`, con un vector de inicialización de 12 bytes
aleatorio y distinto para cada valor y cada cifrado, etiqueta de 128 bits y,
como datos asociados, la codificación UTF-8 de `<id de la tarjeta>:<nombre
del campo>` (`number`, `expiry` o `cvv`). Antes de cifrar, el número SHALL
rellenarse por la izquierda con espacios hasta 19 caracteres y el CVV hasta
4, de modo que los cifrados midan siempre 35, 23 y 20 bytes
respectivamente; al descifrar SHALL eliminarse ese relleno. El identificador
de la tarjeta SHALL ser un UUID versión 4 generado por el cliente antes de
cifrar.

#### Scenario: Ida y vuelta
- **WHEN** se cifra una tarjeta con `K_U` y se descifra con `k_U` del mismo usuario
- **THEN** se obtienen exactamente el número, la caducidad y el CVV originales

#### Scenario: Tamaños fijos
- **WHEN** se cifran una tarjeta de 13 dígitos con CVV de 3 y otra de 19 dígitos con CVV de 4
- **THEN** los cifrados del número miden 35 bytes en las dos, los de la caducidad 23 y los del CVV 20

#### Scenario: Valor manipulado
- **WHEN** se altera un byte del cifrado o del vector de inicialización de un valor
- **THEN** descifrar la tarjeta falla sin devolver ningún dato parcial

#### Scenario: Valor trasladado a otra tarjeta
- **WHEN** se copian el vector y el cifrado del número de una tarjeta sobre otra tarjeta del mismo usuario que comparte la misma `K_t`
- **THEN** descifrar la tarjeta de destino falla, porque los datos asociados incluyen el identificador

#### Scenario: Valor trasladado a otro campo
- **WHEN** se copian el vector y el cifrado del CVV de una tarjeta sobre su propio campo de caducidad
- **THEN** descifrar falla, porque los datos asociados incluyen el nombre del campo

### Requirement: Edición con la misma clave de tarjeta
Al modificar una tarjeta, el cliente SHALL recuperar `K_t` con `k_U` a partir
de la clave envuelta que recibió en el listado y SHALL cifrar solo los
valores modificados, con vectores de inicialización nuevos. La clave envuelta
NO SHALL cambiar en una edición.

#### Scenario: Cambio de la caducidad
- **WHEN** el usuario cambia solo la caducidad de una tarjeta
- **THEN** la petición lleva un cifrado nuevo solo de `expiry`, y el número y el CVV guardados siguen descifrándose con la misma clave envuelta

### Requirement: Datos descifrados solo en memoria y solo lo necesario
El cliente SHALL descifrar las tarjetas únicamente para mostrarlas y SHALL
conservar en su estado solo los cuatro últimos dígitos del número, el mes y
el año de caducidad, junto con los valores cifrados y la clave envuelta. El
número completo y el CVV descifrados SHALL descartarse en cuanto se calcule
ese resumen. Ningún dato descifrado ni ninguna clave SHALL escribirse en la
consola ni en el almacenamiento del navegador.

#### Scenario: Estado del panel tras listar
- **WHEN** el panel termina de cargar las tarjetas
- **THEN** su estado contiene `last4`, `expiryMonth`, `expiryYear`, los valores cifrados y `wrappedKey` de cada tarjeta, y ni el número completo ni el CVV
- **AND** `localStorage`, `sessionStorage` y las cookies siguen vacíos

### Requirement: El servidor no puede leer las tarjetas
El servidor SHALL guardar y devolver los valores cifrados y la clave envuelta
tal como los recibe, sin ninguna clave con la que abrirlos. En claro solo
SHALL quedar el identificador de la tarjeta, la relación con sus usuarios y
las fechas de creación y modificación.

#### Scenario: Inspección de la base de datos
- **WHEN** se consultan directamente `CARD` y `USER_CARD` tras crear una tarjeta `4111111111111111`
- **THEN** ninguna columna contiene `4111111111111111`, `12/2030` ni `123`, y todas las columnas de valores contienen base64 de los tamaños fijados

#### Scenario: Inspección del tráfico
- **WHEN** se observa el cuerpo del alta y la respuesta del listado
- **THEN** ninguno contiene el número, la caducidad, el CVV ni `K_t` en claro

### Requirement: Módulo de cifrado de tarjetas en el cliente
El cliente SHALL tener un módulo `client/src/security/tarjetas-cifradas.js`,
sin dependencias del DOM, que ofrezca `cifrarTarjeta(K_U, { id, number, expiry, cvv })`,
`abrirClaveTarjeta(k_U, wrappedKey)`, `cifrarValores(K_t, id, valores)` y
`descifrarTarjeta(k_U, tarjetaCifrada)`, todo en base64 hacia fuera y
`CryptoKey` hacia dentro, y que lance `TarjetaCifradaError` ante cualquier
fallo de apertura o de integridad sin distinguir la causa. El módulo SHALL
poder ejecutarse en Node con el mismo código, para la semilla, los scripts y
las pruebas.

#### Scenario: Semilla y navegador coinciden
- **WHEN** la semilla cifra la tarjeta de prueba desde Node y el navegador la descifra tras el login del empleado de prueba
- **THEN** el panel muestra `•••• 1111` y `12/30`
