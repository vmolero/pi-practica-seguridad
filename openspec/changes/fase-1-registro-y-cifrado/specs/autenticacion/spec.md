# Spec Delta

## Purpose

Permite a un usuario activo demostrar su identidad (contraseña, doble factor y
posesión de su clave privada) y comprobar a su vez la identidad del servidor,
sin que la contraseña salga nunca del navegador.

## ADDED Requirements

### Requirement: La contraseña nunca sale del navegador
El cliente SHALL derivar de la contraseña, con una función PBKDF y una sal
propia del usuario, dos claves independientes: una de autenticación, que se
envía al servidor, y otra de cifrado, que nunca se envía. Ni la contraseña ni
la clave de cifrado SHALL viajar en ninguna petición ni escribirse en logs.

#### Scenario: Inspección del tráfico de login
- **WHEN** se capturan todas las peticiones de un inicio de sesión correcto
- **THEN** ninguna contiene la contraseña ni la clave de cifrado derivada

### Requirement: Verificación de la clave de autenticación
El servidor SHALL guardar únicamente un hash con sal de la clave de
autenticación y SHALL compararlo en tiempo constante. Desde la base de datos
no SHALL poder obtenerse la clave de autenticación.

#### Scenario: Clave de autenticación correcta
- **WHEN** el cliente envía la clave de autenticación correcta de un usuario activo
- **THEN** el servidor pasa al paso de doble factor sin crear todavía la sesión

#### Scenario: Robo de la base de datos
- **WHEN** un atacante obtiene una copia de la base de datos
- **THEN** no encuentra ni la contraseña, ni la clave de autenticación, ni la clave privada en claro de ningún usuario

### Requirement: Doble factor TOTP
Tras validar la clave de autenticación, el servidor SHALL exigir un código
TOTP de 6 dígitos (RFC 6238, periodo de 30 s, tolerancia de ±1 periodo).
Un código ya aceptado no SHALL aceptarse una segunda vez. El secreto TOTP
SHALL guardarse cifrado en el servidor.

#### Scenario: Código correcto
- **WHEN** el usuario introduce el código TOTP vigente
- **THEN** el servidor pasa al paso de reto-respuesta

#### Scenario: Código reutilizado
- **WHEN** alguien reenvía un código TOTP que ya se aceptó en un login anterior
- **THEN** el servidor lo rechaza con el error genérico

### Requirement: Autenticación mutua por reto-respuesta
Tras el doble factor, el servidor SHALL enviar un reto aleatorio de un solo
uso firmado con su clave privada. El cliente SHALL verificar esa firma con la
clave pública del servidor que trae incorporada y SHALL firmar el reto con la
clave privada de firma del usuario. El servidor SHALL verificarla con la clave
pública registrada del usuario.

#### Scenario: Servidor suplantado
- **WHEN** la firma del reto no se puede verificar con la clave pública del servidor que conoce el cliente
- **THEN** el cliente aborta el login, no firma nada y muestra un aviso de que no se puede verificar la identidad del servidor

#### Scenario: Firma del usuario inválida
- **WHEN** la firma del reto no se puede verificar con la clave pública del usuario
- **THEN** el servidor rechaza el login con el error genérico y no crea sesión

#### Scenario: Reto reutilizado o caducado
- **WHEN** el cliente responde a un reto ya usado o emitido hace más de 2 minutos
- **THEN** el servidor rechaza la respuesta

### Requirement: Sesión
Solo tras superar todos los pasos el servidor SHALL crear una sesión con un
identificador aleatorio en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`.
La sesión SHALL caducar tras 30 minutos de inactividad y 8 horas como máximo.
El servidor SHALL guardar solo el hash del identificador de sesión.

#### Scenario: Recarga de la página
- **WHEN** un usuario con sesión válida recarga la página
- **THEN** sigue con la sesión iniciada, pero debe volver a introducir su contraseña para descifrar sus tarjetas

#### Scenario: Sesión inactiva
- **WHEN** pasan 30 minutos sin peticiones
- **THEN** la siguiente petición recibe 401 y la interfaz vuelve al login

### Requirement: Cierre de sesión
Al cerrar sesión el servidor SHALL invalidar la sesión y el cliente SHALL
borrar de memoria todas las claves y datos descifrados.

#### Scenario: Reutilizar una cookie tras cerrar sesión
- **WHEN** alguien reenvía la cookie de una sesión ya cerrada
- **THEN** el servidor responde 401

### Requirement: Errores que no revelan información
Cualquier fallo en cualquier paso del login SHALL producir el mismo mensaje y
el mismo código HTTP (401), sin indicar si el email existe, si la cuenta está
pendiente o desactivada, ni qué paso ha fallado. La consulta previa de los
parámetros de derivación SHALL devolver una sal determinista falsa para los
emails que no existen.

#### Scenario: Email inexistente
- **WHEN** se piden los parámetros de derivación de un email que no existe
- **THEN** la respuesta tiene el mismo formato que para un email real y repetir la consulta devuelve la misma sal

#### Scenario: Cuenta desactivada
- **WHEN** un usuario desactivado intenta iniciar sesión con sus credenciales correctas
- **THEN** recibe exactamente el mismo error que con una contraseña incorrecta

### Requirement: Limitación de intentos
El servidor SHALL limitar los intentos fallidos de login por cuenta y por
dirección IP. Tras 5 fallos consecutivos de una cuenta en 15 minutos, SHALL
rechazar sus intentos durante 15 minutos con el mismo error genérico.

#### Scenario: Fuerza bruta sobre una cuenta
- **WHEN** se producen 5 intentos fallidos seguidos para el mismo email
- **THEN** el sexto intento se rechaza aunque las credenciales sean correctas, hasta que pasan 15 minutos

### Requirement: Transporte cifrado
El servidor SHALL servir la aplicación y la API solo por HTTPS, también en
desarrollo, y SHALL enviar cabeceras de seguridad (HSTS, Content-Security-Policy
restrictiva, `X-Content-Type-Options: nosniff` y `Referrer-Policy`).

#### Scenario: Petición por HTTP
- **WHEN** un navegador pide la aplicación por HTTP
- **THEN** no recibe la aplicación ni la API en claro
