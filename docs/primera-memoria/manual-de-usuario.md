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
   - el botón **Cerrar sesión**.

En esta versión el servidor ya comprueba el email y la contraseña, pero
todavía no hay ninguna funcionalidad de gestor ni de empleado tras iniciar
sesión. En desarrollo existen estos usuarios de prueba:

| Email                  | Contraseña  | Rol           |
|------------------------|-------------|---------------|
| `empleado@empresa.com` | `demo1234`  | Empleado      |
| `admin@empresa.com`    | `admin1234` | Administrador |

Estos usuarios solo existen en la base de datos de desarrollo. **Aviso:** en
esta versión la contraseña se envía y se guarda sin cifrar; no uses una
contraseña real.

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

Funcionalidades

* Login con usuario y contraseña
* Crear, modificar, eliminar empleados
* Asociar/Quitar tarjeta de empresa a empleados
* Asociar/Revocar contrato a empleados para cada tarjeta.

## Rol de empleado

* Login con usuario y contraseña
* Añadir su tarjeta propia
* Descargar contrato de tarjeta de empresa (si tiene alguna asociada)
* Compartir tarjeta con otro empleado (tiene sentido?)
* Cerrar sesión
