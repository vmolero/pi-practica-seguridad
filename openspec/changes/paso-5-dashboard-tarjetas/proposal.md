# Propuesta: paso 5 — dashboard de tarjetas del usuario

## Why

Tras iniciar sesión, el usuario solo ve su nombre y su email: la función
principal de la aplicación, guardar sus tarjetas, aún no existe. Con la tabla
de tarjetas del paso 4 (`paso-4-tabla-tarjetas`) ya hay dónde guardarlas;
falta la API y la interfaz para que cada usuario dé de alta sus tarjetas, vea
las que tiene y las corrija o elimine.

## What Changes

- **API de tarjetas** bajo `/api/private/cards`, para cualquier usuario con
  sesión (empleado o administrador), siempre sobre **sus propias** tarjetas:
  - `GET` lista las tarjetas del usuario con el número **enmascarado** (solo
    los 4 últimos dígitos) y la caducidad; nunca devuelve el número completo
    ni el CVV.
  - `POST` da de alta una tarjeta con número, fecha de caducidad (mes y año) y
    CVV, y responde con la tarjeta enmascarada.
  - `PATCH /:id` modifica solo los campos enviados (número, caducidad o CVV),
    de modo que para cambiar la caducidad no hace falta volver a teclear el
    número ni el CVV.
  - `DELETE /:id` elimina la tarjeta.
  - Una tarjeta ajena responde `404`, igual que una inexistente. Modificar o
    borrar exige ser el **propietario**: en la fase 2, quien reciba una
    tarjeta compartida podrá verla pero no cambiarla (`403`).
- **Validación en el servidor y en el cliente**: número de 13 a 19 dígitos
  (se admiten espacios y guiones al escribir) que supere la comprobación de
  Luhn, caducidad válida y no vencida, y CVV de 3 o 4 dígitos.
- **Dashboard de tarjetas en el cliente**: la vista de sesión muestra a todos
  los usuarios una sección "Mis tarjetas" con la lista (`•••• 1234`,
  caducidad `MM/AA`), un mensaje cuando no hay ninguna y un formulario de alta
  accesible con los atributos `autocomplete` de tarjeta. Cada tarjeta tiene
  "Editar" (formulario en línea) y "Eliminar" (con confirmación en la propia
  interfaz). El CVV se borra del estado del formulario tras cada envío y nunca
  se muestra después.
- **Un administrador** también tiene su dashboard de tarjetas propias, pero
  **no** puede ver las tarjetas de otros usuarios (ni por esta API ni por la
  de administración).
- **PROVISIONAL**: los datos se envían sin cifrar en la aplicación y se guardan en
  texto claro (paso 4). La fase 1 los cifrará en el navegador antes de enviarlos.

**Fuera de alcance:** ver el número completo o el CVV de una tarjeta, alias,
titular y notas, compartir tarjetas (fase 2) y
paginación.

## Capabilities

### New Capabilities

- `panel-tarjetas`: API y dashboard con los que un usuario con sesión da de
  alta, lista enmascaradas, modifica y elimina sus tarjetas (número, caducidad
  y CVV).
  Es un paso intermedio, sin cifrado, de la capacidad `boveda-tarjetas`
  prevista en `fase-1-registro-y-cifrado`, que lo reemplazará.

### Modified Capabilities

Ninguna en `openspec/specs/`. Usa sin cambios el middleware de `sesion-jwt`
(`paso-2-middleware-jwt`) y el almacén de `almacen-tarjetas`
(`paso-4-tabla-tarjetas`, requisito previo).

## Impact

- **Servidor (`server/`)**: nuevo servicio de aplicación de tarjetas,
  validación de la petición de alta (incluida Luhn), función de dominio que
  enmascara la tarjeta, router `/api/private/cards` montado en el router
  privado y conexión en `createApp`, `server/index.js` y los tests.
- **Cliente (`client/`)**: nuevo módulo `client/src/api/cards.js` sobre
  `apiFetch`, validación compartida en el cliente y componente
  `CardDashboard.jsx` (lista, alta, edición y borrado) montado en
  `SessionView.jsx` para todos los usuarios.
- **Pruebas**: unitarias de la validación y del servicio, e integración del
  router.
- **Dependencias**: ninguna nueva.
- **Documentación afectada**:
  - `README.md`: "Estado actual" (paso 5), "API" (los cuatro endpoints con sus
    cuerpos, códigos y un ejemplo con `curl`) y "Vista de login" (el dashboard
    tras iniciar sesión).
  - `docs/primera-memoria/implementacion-y-seguridad.md`: nueva sección
    "Dashboard de tarjetas (paso 5)" (control de acceso por relación,
    validación, enmascarado, qué nunca sale del servidor, límites de este paso)
    y actualización de "Estructura del proyecto" y "Trabajo futuro".
  - `docs/primera-memoria/manual-de-usuario.md`: secciones "Qué ve el usuario"
    y "Rol de empleado" (el dashboard, cómo dar de alta, modificar y eliminar
    una tarjeta y sus mensajes de error) y una nota en "Rol de gestor" (también tiene su
    dashboard y no ve las tarjetas ajenas).
