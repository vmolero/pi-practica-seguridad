# Manual de usuario

# Pantalla de Login

Es la primera pantalla que ve cualquier usuario (gestor o empleado) al abrir la
aplicación. Para acceder al resto de funcionalidades es necesario iniciar
sesión.

## Qué ve el usuario

En la parte superior aparece el nombre de la aplicación, **Tarjetas de
empresa**. Mientras la aplicación está en desarrollo, a su lado se muestra la
etiqueta **Desarrollo**.

A la izquierda (o arriba, en pantallas estrechas) se muestra una presentación:

> **Acceso de empleados**
> Tus tarjetas, a salvo.
> Inicia sesión con tu email de empresa para gestionar tus tarjetas.

Junto a ella aparece el panel **Identificación — Iniciar sesión**, con:

- Campo **Email**.
- Campo **Contraseña** (el texto se oculta mientras se escribe).
- Botón **Iniciar sesión**.

Al pie de la página se indica **Acceso exclusivo para empleados**.

## Campos

| Campo      | Descripción                                          | Obligatorio |
|------------|------------------------------------------------------|-------------|
| Email      | Dirección de correo con la que el usuario está dado de alta en la empresa. Es su identificador. Se ignoran los espacios al principio y al final. | Sí |
| Contraseña | Contraseña personal del usuario.                     | Sí          |

## Validaciones y mensajes de error

Al pulsar **Iniciar sesión**, antes de enviar los datos, la aplicación
comprueba los campos y muestra el mensaje debajo del campo que falla:

| Situación                               | Mensaje                                         |
|-----------------------------------------|-------------------------------------------------|
| El email está vacío                     | *Introduce tu email.*                           |
| El email no tiene un formato válido     | *Introduce un email con un formato válido.*     |
| La contraseña está vacía                | *Introduce tu contraseña.*                      |

Mientras haya algún error, el formulario no se envía.

Si el email y la contraseña no corresponden a ningún usuario, se muestra encima
del botón el mensaje:

> *Email o contraseña incorrectos.*

Por seguridad, el mensaje es siempre el mismo, tanto si el email no existe como
si la contraseña es incorrecta: la aplicación no indica cuál de los dos datos ha
fallado. El email no distingue mayúsculas y minúsculas; la contraseña sí.

Si no se puede contactar con el servidor o este falla, se muestra:

> *No se ha podido iniciar sesión. Inténtalo de nuevo.*

Después de cualquier intento fallido, el campo de contraseña se vacía y hay que
volver a escribirla.

## Iniciar sesión

1. Escribe tu email y tu contraseña.
2. Pulsa **Iniciar sesión**.
3. Mientras se comprueban los datos, el botón cambia a **Iniciando sesión…** y
   los campos y el botón quedan deshabilitados.
4. Si los datos son correctos, se muestra la pantalla de sesión iniciada:
   - el saludo **Hola de nuevo.** y el texto *Has iniciado sesión
     correctamente.*;
   - el panel **Tu cuenta — Sesión activa**, con el nombre del usuario en la
     fila **Nombre** y su email en la fila **Usuario**. Estos datos los
     devuelve el servidor tras comprobar la sesión;
   - el botón **Cerrar sesión**;
   - debajo, el panel **Tu cartera — Mis tarjetas** (ver
     [Rol de empleado](#rol-de-empleado)), que tienen todos los usuarios;
   - si eres gestor, además, el panel **Usuarios** (ver
     [Rol de gestor](#rol-de-gestor)).

En desarrollo existen estos usuarios de prueba:

| Email                  | Contraseña  | Rol           |
|------------------------|-------------|---------------|
| `empleado@empresa.com` | `demo1234`  | Empleado      |
| `admin@empresa.com`    | `admin1234` | Administrador |

Estos usuarios solo existen en la base de datos de desarrollo. El empleado de
prueba tiene ya una tarjeta de prueba (`•••• 1111`, caducidad 12/30).
**Aviso:** en esta versión la contraseña y los datos de las tarjetas se envían
y se guardan sin cifrar; no uses una contraseña ni una tarjeta reales.

## Cerrar sesión

En la pantalla de sesión iniciada, pulsa **Cerrar sesión**. La sesión termina y
vuelves a la pantalla de login con los campos vacíos. Para volver a entrar
tendrás que introducir de nuevo tu email y tu contraseña.

En esta versión la sesión solo existe mientras la página está abierta: si
recargas la página o la cierras, la sesión se pierde y vuelve a aparecer la
pantalla de login.

## Sesión caducada

Por seguridad, la sesión caduca pasado un tiempo (una hora, salvo que el
administrador del servidor configure otro valor). La aplicación lo comprueba
al iniciar sesión y cada vez que vuelves a su ventana. Si la sesión ha
caducado, vuelves a la pantalla de login con el aviso:

> *Tu sesión ha caducado. Vuelve a iniciar sesión.*

Introduce de nuevo tu email y tu contraseña para seguir. Este aviso no aparece
cuando cierras la sesión tú mismo.

## Rol de gestor

Un gestor (administrador) inicia sesión igual que cualquier empleado y tiene
también su propio panel **Mis tarjetas**, que funciona igual que el de un
empleado (ver [Rol de empleado](#rol-de-empleado)). Ser gestor **no** permite
ver ni cambiar las tarjetas de los empleados. Debajo ve además el panel
**Usuarios**, desde el que gestiona las cuentas de la aplicación. Los
empleados no ven este panel.

### Ver los usuarios

La tabla muestra el nombre, el email y el rol (*Empleado* o *Administrador*)
de cada usuario. Tu propia fila lleva la marca *(tú)*. En el móvil, cada
usuario aparece como una tarjeta con los mismos datos.

### Dar de alta un usuario

1. En *Dar de alta un usuario*, escribe el **nombre**, el **email** y una
   **contraseña inicial** de al menos 8 caracteres.
2. Marca **Administrador** si la nueva cuenta debe poder gestionar usuarios.
3. Pulsa **Dar de alta**.

El usuario aparece en la tabla y el formulario se vacía. Comunícale su email y
su contraseña inicial: con ellos ya puede iniciar sesión. El email se guarda
en minúsculas, así que da igual cómo lo escribas.

> **Provisional:** de momento la contraseña inicial la elige el gestor y se
> guarda sin cifrar. Más adelante se sustituirá por una invitación en la que
> cada empleado elige su propia contraseña.

### Cambiar el nombre de un usuario

1. Pulsa **Editar** en su fila.
2. Escribe el nuevo nombre y pulsa **Guardar** (o Intro). **Cancelar** deja el
   nombre como estaba.

Solo se puede cambiar el nombre. El email, el rol y la contraseña no se pueden
modificar desde el panel. Si cambias tu propio nombre, la tarjeta *Sesión
activa* seguirá mostrando el anterior hasta que vuelvas a iniciar sesión.

### Eliminar un usuario

1. Pulsa **Eliminar** en su fila.
2. La fila pregunta *¿Eliminar a …?*. Pulsa **Confirmar** para borrarlo o
   **Cancelar** para dejarlo.

La eliminación es definitiva: el usuario desaparece de la tabla y ya no puede
iniciar sesión. No puedes eliminar tu propia cuenta (tu fila no tiene el botón
*Eliminar*).

### Mensajes de error

Los mensajes aparecen en rojo encima de la tabla:

| Mensaje | Causa |
| --- | --- |
| *Ya existe un usuario con ese email* | El email ya pertenece a otra cuenta. El formulario conserva el nombre y el email, pero tendrás que volver a escribir la contraseña. |
| *Datos de usuario no válidos* | Algún campo no cumple las reglas: nombre de 1 a 100 caracteres, email válido o contraseña de 8 a 128 caracteres. |
| *Usuario no encontrado* | Otro gestor ha eliminado ese usuario mientras tanto. |
| *No tienes permiso para gestionar usuarios.* | Tu cuenta ya no es de administrador (por ejemplo, otro gestor la ha eliminado). El panel oculta los botones. |
| *No se ha podido completar la operación. Inténtalo de nuevo.* | El servidor no responde o ha fallado. |

Si tu sesión caduca mientras usas el panel, vuelves a la pantalla de login con
el aviso de sesión caducada.

### Pendiente

* Asociar/Quitar tarjeta de empresa a empleados
* Asociar/Revocar contrato a empleados para cada tarjeta.

## Rol de empleado

Tras iniciar sesión, cualquier usuario ve el panel **Tu cartera — Mis
tarjetas**, donde guarda y gestiona sus tarjetas. Nadie más puede verlas, ni
siquiera un gestor.

### Ver tus tarjetas

Cada tarjeta aparece con el número **enmascarado**, del que solo se ven los
cuatro últimos dígitos (por ejemplo, `•••• 1111`), y su caducidad en la forma
*Caduca MM/AA*. El número completo y el CVV no se vuelven a mostrar nunca
después de guardarlos. Si todavía no tienes ninguna, el panel indica
*Todavía no has guardado ninguna tarjeta.*

### Añadir una tarjeta

1. En *Añadir una tarjeta*, escribe el **número de tarjeta** (puedes separar
   los dígitos con espacios o guiones), la **caducidad** (mes y año de cuatro
   cifras) y el **CVV** (el texto se oculta mientras se escribe).
2. Pulsa **Guardar tarjeta**.

La tarjeta aparece en la lista y el formulario se vacía. El navegador puede
ofrecerte autocompletar los datos de tus tarjetas guardadas.

### Modificar una tarjeta

1. Pulsa **Editar** en la tarjeta. Se abre un formulario con la caducidad
   rellenada y el número y el CVV vacíos.
2. Cambia solo lo que quieras corregir. **Deja vacío** el número o el CVV si
   no quieres cambiarlos.
3. Pulsa **Guardar**. **Cancelar** deja la tarjeta como estaba.

### Eliminar una tarjeta

1. Pulsa **Eliminar** en la tarjeta.
2. La fila pregunta *¿Eliminar la tarjeta •••• 1234?*. Pulsa **Confirmar**
   para borrarla o **Cancelar** para dejarla.

La eliminación es definitiva.

### Mensajes de error

Antes de enviar nada, la aplicación comprueba los datos y muestra el mensaje
debajo del campo que falla:

| Situación | Mensaje |
| --- | --- |
| El número no tiene de 13 a 19 dígitos o no es un número de tarjeta válido (no supera la comprobación de Luhn) | *El número de tarjeta no es válido.* |
| El mes no está entre 1 y 12, el año no tiene cuatro cifras o está a más de 20 años | *La fecha de caducidad no es válida.* |
| La tarjeta caducó antes del mes actual (una tarjeta vale hasta el último día de su mes) | *La tarjeta está caducada.* |
| Al editar, se ha rellenado el mes sin el año o al revés | *Indica el mes y el año de caducidad.* |
| El CVV no tiene 3 o 4 dígitos | *El CVV debe tener 3 o 4 dígitos.* |
| Al editar, no se ha cambiado nada | *No has cambiado ningún dato.* |

Los errores que devuelve el servidor aparecen en rojo encima de la lista:

| Mensaje | Causa |
| --- | --- |
| *Datos de tarjeta no válidos* | El servidor ha rechazado los datos. El formulario conserva el número y la caducidad, pero tendrás que volver a escribir el CVV. |
| *Tarjeta no encontrada* | La tarjeta se ha eliminado mientras tanto (por ejemplo, desde otra ventana). Desaparece de la lista. |
| *No se ha podido completar la operación. Inténtalo de nuevo.* | El servidor no responde o ha fallado. |

Si tu sesión caduca mientras usas el panel, vuelves a la pantalla de login con
el aviso de sesión caducada.

> **Provisional:** en esta versión los datos de las tarjetas, incluido el CVV,
> se envían y se guardan sin cifrar. La fase 1 los cifrará en el navegador.

### Pendiente

* Descargar contrato de tarjeta de empresa (si tiene alguna asociada)
* Compartir tarjeta con otro empleado (fase 2)
