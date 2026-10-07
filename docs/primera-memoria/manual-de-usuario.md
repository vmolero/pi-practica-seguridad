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
fallado. Después de un intento fallido, el campo de contraseña se vacía y hay
que volver a escribirla.

## Iniciar sesión

1. Escribe tu email y tu contraseña.
2. Pulsa **Iniciar sesión**.
3. Mientras se comprueban los datos, el botón cambia a **Iniciando sesión…** y
   los campos y el botón quedan deshabilitados.
4. Si los datos son correctos, se muestra la pantalla de sesión iniciada:
   - el saludo **Hola de nuevo.** y el texto *Has iniciado sesión
     correctamente.*;
   - el panel **Tu cuenta — Sesión activa**, con el email del usuario en la
     fila **Usuario**;
   - el botón **Cerrar sesión**.

En esta versión el inicio de sesión está **simulado**: todavía no hay servidor
de autenticación, así que todavía no hay ninguna funcionalidad de gestor ni de
empleado tras iniciar sesión. Para probarlo, usa estas credenciales:

| Email                  | Contraseña |
|------------------------|------------|
| `empleado@empresa.com` | `demo1234` |

Estas credenciales **solo existen en la simulación** y desaparecerán cuando se
conecte el backend real; a partir de entonces cada usuario entrará con su
propio email y su propia contraseña.

## Cerrar sesión

En la pantalla de sesión iniciada, pulsa **Cerrar sesión**. La sesión termina y
vuelves a la pantalla de login con los campos vacíos. Para volver a entrar
tendrás que introducir de nuevo tu email y tu contraseña.

En esta versión la sesión solo existe mientras la página está abierta: si
recargas la página o la cierras, la sesión se pierde y vuelve a aparecer la
pantalla de login.

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
