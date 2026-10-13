# Propuesta: paso 3 — panel de administración de usuarios

## Why

Hoy los usuarios solo existen a través del seed de desarrollo: no hay forma de
dar de alta, renombrar ni eliminar cuentas desde la aplicación, y el rol de
administrador (`isAdmin`, ya presente en el token desde el paso 2) no habilita
nada. Este paso convierte ese rol en el primer control de acceso real del
servidor y da al gestor un panel para administrar las cuentas, que es la base
sobre la que la fase 1 (`fase-1-registro-y-cifrado`) construirá la invitación y
la activación con material criptográfico.

## What Changes

- **API de administración** bajo `/api/private/admin/users`, solo para
  administradores:
  - `GET` lista los usuarios (`id`, `name`, `email`, `isAdmin`), nunca la
    contraseña.
  - `POST` da de alta un usuario con nombre, email, contraseña inicial y rol.
  - `PATCH /:id` modifica el nombre (solo el nombre).
  - `DELETE /:id` elimina el usuario. Un administrador no puede eliminarse a sí
    mismo.
- **Control de acceso por rol en el servidor**: un middleware de administrador
  exige `isAdmin` en el token **y** lo vuelve a comprobar contra la base de
  datos en cada petición, de modo que un administrador eliminado o degradado
  pierde el acceso al panel aunque su token siga sin caducar. Un empleado recibe
  `403`.
- **Panel de administración en el cliente**: tras iniciar sesión, un
  administrador ve una sección "Usuarios" con la tabla de cuentas, un formulario
  de alta, la edición del nombre en línea y la eliminación con confirmación en
  la propia interfaz. Los empleados no ven la sección.
- **PROVISIONAL**: la contraseña inicial que elige el gestor se guarda en texto
  claro, igual que en el paso 1. La fase 1 sustituirá el alta directa por la
  invitación, en la que el gestor nunca conoce la contraseña del empleado.

**Fuera de alcance:** cambiar el email, el rol o la contraseña de un usuario
existente, la desactivación (en vez de borrado), la invitación por enlace, la
paginación y la revocación de los tokens del usuario eliminado en `/me`.

## Capabilities

### New Capabilities

- `administracion-usuarios`: API y panel con los que un administrador lista, da
  de alta, renombra y elimina usuarios, y el control de acceso por rol que los
  protege. Es un paso intermedio y más simple que la capacidad
  `gestion-usuarios` prevista en `fase-1-registro-y-cifrado`, que lo
  reemplazará.

### Modified Capabilities

Ninguna. `autenticacion` no cambia, y `sesion-jwt` (del cambio
`paso-2-middleware-jwt`, aún sin archivar) se usa tal cual: este paso solo
añade rutas detrás de su middleware.

## Impact

- **Servidor (`server/`)**: nuevo servicio de aplicación de usuarios, nuevos
  métodos en `user-repository.js` (listar, buscar por id, crear, renombrar,
  borrar), un middleware de administrador, un router `/api/private/admin/users`
  y su validación de peticiones; nuevos errores de aplicación. Sin migraciones:
  la tabla `USER` ya tiene todo lo necesario.
- **Cliente (`client/`)**: nuevo módulo `client/src/api/admin-users.js` sobre
  `apiFetch` y un componente de panel de administración que se muestra en la
  vista de sesión solo para administradores.
- **Pruebas**: pruebas de integración del router y unitarias del servicio y de
  la validación.
- **Dependencias**: ninguna nueva.
- **Documentación afectada**:
  - `README.md`: secciones "Estado actual", "API" (nuevos endpoints y ejemplo
    con `curl`) y "Vista de login" (el panel tras iniciar sesión).
  - `docs/primera-memoria/implementacion-y-seguridad.md`: nueva sección del
    paso 3 (control de acceso por rol, doble comprobación token + base de
    datos, flujo de cada endpoint, límites) y actualización de "Estructura del
    proyecto" y "Trabajo futuro".
  - `docs/primera-memoria/manual-de-usuario.md`: la sección "Rol de gestor" pasa
    a describir el panel real (alta, renombrar, eliminar, mensajes de error).
