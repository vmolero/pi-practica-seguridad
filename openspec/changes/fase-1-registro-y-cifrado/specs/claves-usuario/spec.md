# Spec Delta

## Purpose

Define el ciclo de vida de las claves asimétricas de los usuarios y del
servidor: dónde se generan, cómo se custodian cifradas y cómo se garantiza que
una clave pública pertenece de verdad a quien dice.

## ADDED Requirements

### Requirement: Generación de claves en el cliente
Durante la activación, el navegador del usuario SHALL generar dos pares de
claves asimétricas independientes: uno de cifrado, para envolver claves AES, y
otro de firma, para autenticarse. Las claves privadas no SHALL salir del
navegador sin cifrar.

#### Scenario: Activación de un usuario
- **WHEN** un usuario completa la activación
- **THEN** el servidor recibe sus dos claves públicas y sus claves privadas solo cifradas

### Requirement: Custodia cifrada de la clave privada
El cliente SHALL cifrar las claves privadas con la clave de cifrado derivada de
la contraseña, usando un cifrado autenticado y un vector de inicialización
aleatorio. El servidor SHALL guardar ese bloque cifrado y entregarlo solo al
propio usuario, durante el login y después de validar su clave de
autenticación.

#### Scenario: Inicio de sesión desde otro equipo
- **WHEN** el usuario inicia sesión desde un navegador nuevo con su contraseña correcta
- **THEN** recibe su bloque de claves privadas cifrado y lo descifra en el navegador

#### Scenario: Bloque manipulado
- **WHEN** el bloque cifrado de claves privadas se ha modificado en la base de datos
- **THEN** el cliente detecta el fallo de integridad al descifrarlo, aborta el login y no usa ninguna clave

### Requirement: Identidad del servidor
El servidor SHALL tener un par de claves de firma propio, generado con un
script de instalación. Su clave privada SHALL guardarse fuera de la base de
datos y cifrada con una frase de paso. La clave pública SHALL incorporarse al
cliente al compilarlo, y el cliente no SHALL aceptar otra en tiempo de
ejecución.

#### Scenario: Arranque sin la frase de paso
- **WHEN** el servidor arranca sin la frase de paso de su clave privada o con una incorrecta
- **THEN** el servidor no arranca y muestra un error que no revela la clave

### Requirement: Certificación de claves públicas
Al activar una cuenta, el servidor SHALL firmar con su clave privada un
certificado que vincula el identificador y el email del usuario con sus dos
claves públicas. Cada vez que el cliente use una clave pública de un usuario,
SHALL verificar antes ese certificado.

#### Scenario: Clave pública sustituida
- **WHEN** la clave pública de un usuario se ha cambiado en la base de datos sin un certificado válido del servidor
- **THEN** el cliente rechaza esa clave y no cifra nada con ella

### Requirement: Claves privadas solo en memoria
En el navegador, las claves privadas descifradas y la clave de cifrado
derivada SHALL existir solo en memoria, como claves no exportables siempre
que sea posible. No SHALL guardarse en `localStorage`, `sessionStorage`,
IndexedDB ni cookies.

#### Scenario: Inspección del almacenamiento del navegador
- **WHEN** se inspecciona el almacenamiento del navegador con una sesión iniciada
- **THEN** no aparece ninguna clave privada, clave derivada ni contraseña
