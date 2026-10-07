# Spec Delta

## Purpose

Permite a cada usuario guardar y gestionar sus propias tarjetas cifradas de
extremo a extremo, de modo que solo él pueda leerlas y que cualquier
manipulación se detecte.

## ADDED Requirements

### Requirement: Datos de una tarjeta
Una tarjeta SHALL contener alias, titular, número (13 a 19 dígitos que superen
la comprobación de Luhn), mes y año de caducidad, y notas opcionales. El
código de seguridad (CVV) no SHALL guardarse. El cliente SHALL validar estos
campos antes de cifrarlos.

#### Scenario: Número inválido
- **WHEN** el usuario introduce un número de tarjeta que no supera la comprobación de Luhn
- **THEN** la interfaz muestra el error junto al campo y no guarda la tarjeta

### Requirement: Cifrado de extremo a extremo
El cliente SHALL cifrar todos los campos de la tarjeta antes de enviarla. El
servidor SHALL guardar y devolver solo datos cifrados y no SHALL poder
descifrarlos. En claro solo SHALL quedar el identificador, el propietario y
las fechas de creación y modificación.

#### Scenario: Inspección de la base de datos
- **WHEN** se consulta directamente la tabla de tarjetas
- **THEN** no aparece en claro ningún alias, titular, número, caducidad ni nota

### Requirement: Clave AES aleatoria por tarjeta
Cada versión guardada de una tarjeta SHALL cifrarse con AES de 256 bits en un
modo autenticado, usando una clave aleatoria nueva y un vector de
inicialización aleatorio. La clave AES SHALL guardarse envuelta con la clave
pública de cifrado del propietario, cuyo certificado se verifica antes.

#### Scenario: Dos tarjetas con los mismos datos
- **WHEN** el usuario guarda dos tarjetas con exactamente los mismos datos
- **THEN** sus datos cifrados y sus claves envueltas son distintos

#### Scenario: Edición de una tarjeta
- **WHEN** el usuario edita una tarjeta y la guarda
- **THEN** la nueva versión usa una clave AES y un vector de inicialización nuevos

### Requirement: Integridad y vinculación al propietario
El cifrado SHALL autenticar como datos asociados el identificador de la
tarjeta y el de su propietario, de modo que no pueda moverse un registro
cifrado a otra tarjeta u otro usuario sin que se detecte.

#### Scenario: Datos cifrados manipulados
- **WHEN** se modifica un solo byte de los datos cifrados de una tarjeta en la base de datos
- **THEN** el cliente muestra que esa tarjeta está dañada, no muestra datos parciales y sigue mostrando el resto de tarjetas

#### Scenario: Registro copiado a otra tarjeta
- **WHEN** se copian los datos cifrados de una tarjeta sobre otra tarjeta del mismo usuario
- **THEN** el cliente detecta el fallo de integridad al descifrar la tarjeta de destino

### Requirement: Gestión de las propias tarjetas
Un usuario con sesión iniciada SHALL poder listar, ver, crear, editar y borrar
sus propias tarjetas. El servidor SHALL rechazar cualquier operación sobre
tarjetas de otro usuario, y los gestores tampoco SHALL poder leer las tarjetas
de los empleados.

#### Scenario: Acceso a la tarjeta de otro usuario
- **WHEN** un usuario pide, modifica o borra una tarjeta cuyo propietario es otro usuario
- **THEN** el servidor responde 404, igual que si no existiera

#### Scenario: Borrado de una tarjeta
- **WHEN** el usuario confirma el borrado de una de sus tarjetas
- **THEN** la tarjeta desaparece de su lista y el servidor elimina sus datos cifrados y su clave envuelta

### Requirement: Visualización de datos sensibles
La interfaz SHALL mostrar enmascarado el número de la tarjeta, salvo los 4
últimos dígitos, hasta que el usuario pida verlo. Los datos descifrados no
SHALL escribirse en la consola ni guardarse en el almacenamiento del navegador.

#### Scenario: Lista de tarjetas
- **WHEN** el usuario abre su lista de tarjetas
- **THEN** cada tarjeta muestra su alias y el número en la forma `•••• 1234`
