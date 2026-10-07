# Spec Delta

## Purpose

Gestiona quién puede usar la aplicación: el alta del primer administrador, la
invitación y activación de empleados, los roles de gestor y empleado y la
desactivación de cuentas, sin que nadie más que el propio usuario conozca sus
secretos.

## ADDED Requirements

### Requirement: Alta del primer administrador
El sistema SHALL permitir crear el primer usuario con rol de gestor
únicamente mediante un script ejecutado en el servidor, que genera una
invitación de un solo uso para él. No SHALL existir ningún endpoint público
que cree administradores sin una sesión de gestor.

#### Scenario: Instalación nueva
- **WHEN** un operador ejecuta el script de alta del administrador con un email válido en un servidor sin usuarios
- **THEN** el sistema crea el usuario con rol de gestor en estado pendiente y muestra por consola un enlace de activación de un solo uso

#### Scenario: Intento de alta sin sesión
- **WHEN** alguien sin sesión de gestor envía una petición para crear un usuario
- **THEN** el sistema responde 401 y no crea ningún usuario

### Requirement: Invitación de empleados
Un gestor con sesión iniciada SHALL poder invitar a un usuario indicando su
nombre, su email y su rol (gestor o empleado). El sistema SHALL generar un
token de invitación aleatorio, de un solo uso, que caduca a las 72 horas, y
SHALL guardar solo su hash.

#### Scenario: Invitación correcta
- **WHEN** un gestor invita a `ana@empresa.com` como empleada
- **THEN** el sistema crea el usuario en estado pendiente y devuelve un enlace de activación que el gestor entrega a la empleada

#### Scenario: Email repetido
- **WHEN** un gestor invita a un email que ya pertenece a otro usuario
- **THEN** el sistema responde 409 y no crea ningún usuario nuevo

#### Scenario: Empleado intenta invitar
- **WHEN** un usuario con rol de empleado intenta invitar a otro usuario
- **THEN** el sistema responde 403

### Requirement: Activación de la cuenta
El usuario invitado SHALL completar el alta desde el enlace de activación
eligiendo su contraseña, generando sus pares de claves y configurando el doble
factor, todo ello en su navegador. La cuenta solo SHALL quedar activa cuando
el servidor haya recibido y validado todo ese material.

#### Scenario: Activación correcta
- **WHEN** el usuario abre un enlace de activación válido, elige una contraseña que cumple la política y confirma un código TOTP correcto
- **THEN** la cuenta pasa a estado activo, el token de invitación queda consumido y el usuario puede iniciar sesión

#### Scenario: Token caducado o usado
- **WHEN** alguien abre un enlace de activación caducado o ya utilizado
- **THEN** el sistema muestra que el enlace no es válido y no permite completar el alta

#### Scenario: Activación interrumpida
- **WHEN** el usuario abandona la activación antes de confirmar el código TOTP
- **THEN** la cuenta sigue pendiente y el mismo enlace puede volver a usarse mientras no caduque

### Requirement: Política de contraseñas
El sistema SHALL exigir en la activación una contraseña de al menos 12
caracteres que no coincida con el email del usuario. La comprobación se hace
en el navegador, porque el servidor nunca recibe la contraseña.

#### Scenario: Contraseña demasiado corta
- **WHEN** el usuario elige una contraseña de 8 caracteres durante la activación
- **THEN** la interfaz muestra el motivo y no continúa con la activación

### Requirement: Roles y control de acceso
Cada usuario SHALL tener exactamente un rol: gestor o empleado. El servidor
SHALL comprobar el rol en cada endpoint de gestión de usuarios,
independientemente de lo que muestre la interfaz.

#### Scenario: Empleado accede a la gestión de usuarios
- **WHEN** un empleado con sesión iniciada pide la lista de usuarios
- **THEN** el sistema responde 403

#### Scenario: Gestor consulta usuarios
- **WHEN** un gestor pide la lista de usuarios
- **THEN** el sistema devuelve nombre, email, rol y estado de cada usuario, sin ningún material criptográfico privado

### Requirement: Desactivación de usuarios
Un gestor SHALL poder desactivar y reactivar a otro usuario. Un usuario
desactivado no SHALL poder iniciar sesión, y sus sesiones abiertas SHALL
invalidarse. Un gestor no SHALL poder desactivarse a sí mismo.

#### Scenario: Desactivación con sesión abierta
- **WHEN** un gestor desactiva a un empleado que tiene una sesión abierta
- **THEN** la siguiente petición de ese empleado recibe 401 y su intento de volver a iniciar sesión falla con el error genérico

#### Scenario: Autodesactivación
- **WHEN** un gestor intenta desactivarse a sí mismo
- **THEN** el sistema responde 400 y la cuenta sigue activa
