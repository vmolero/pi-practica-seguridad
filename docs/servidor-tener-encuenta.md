13-oct-2026

Backend
--

1. Securización del canal: api, socket.. Usaremos un certificado (autofirmados) Usar OpenSSL.

2. Registro de los usuarios
Hay que guardar, su información (login usuario y clave) usar hash deterministico. Conocimiento cero.

SHA3

H(PASS) 256: 128 + 128 sacamos 2 contraseñas, una para cifrar la clave y la otra. Clave de datos y clave de login

Hashes para proteger las contraseñas al almacenarlas
PBKDF básico no estándard (deshuso)
scrypt, bcrypt o argon2

Hay que almacenar la sal tb en la tabla, uno por cada usuario.
Tb con pimienta. Vector aleatorio, el mismo para todos los usuarios

3. Validación mediante middleware estructurado (de autenticación).

4. ¿Se ha forzado para que sea conocimiento 0?


ENtrega memoria
Memoria corta y estructurada: índice + manual de usuario (nivel de usuario) Cómo se instala y como se usa la herramienta

Doc sobre implementación
---
Arquitectura y stack tecnologico
Las funciones más imp desde el pto de vista criptográfico, documentarlo aquí
Capitulo especifico sobre seguridad donde, de forma formal se documenta la criptografía utilizada. GLosario de variables según visto en teoría.

Objetivo: que quede claro como se hace el cifrado (usando not matematica)
Generación de claves y protección de claves. Cifrado del canal.

Propuestas de mejora. (es para la memoria final)
Video: seguimiento del manual de usuario. Cuestiones de seguridad sí mencionar o mostrar en código.


Cliente:

Login
---
Contraseña -> padding hasta 256 bits -> usar 128 para datos , 128 para clave

Datos
----
El json (payload) se envia en texto claro con los valores de cada clave cifrados
Cifrados usando SHA los datos
Cifrados usando SHA la clave