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

4. ¿Se ha forzado para que sea conocimeinto 0?
