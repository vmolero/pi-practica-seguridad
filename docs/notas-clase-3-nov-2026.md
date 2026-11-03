Fase 2: pensar por un lado m que vamos a añadir como info para compartir. 
1o Robusto criptográficamente. Añadir todas las cuestiones de seguridad que queramos.

2FA, etc

Hay que pensar el dato a compartir, sea un registro un archivo. Habiendo L usuarios

De cada usuario hay Ka y ka  + Ka, kb con RSA o curva eliptica. Justificarlo en la memoria
Hay que usar un sistema hibrido y que no se duplique la información. 

Que hay que hacer,

## Encriptarlo para protegerlo

Eaes_kfile(file) = file.enc (NO se duplica)

siendo kfile aleatoria de los bits necesarios128,256...

Para descifrarlo hace flata el kfile = file.key  (se duplica para cada usuario)

eRSA_Ka(kfile) => file.key_A.enc para usuario A
eRSA_Kb(kfile) => file.key_B.enc para usuario B

Compartir implica encriptar la llave

Almacenar los ficheros encriptados con su referencia (no glob de fichero)

Escenario: qué ocurre si alguien más s eañade a la compartición?

eRSA_Kc(ffile) como hemos visto para B


qué pasa si tengo que quitar a alguien?

NO basta con eliminar la relacion de ese usuario con esa clave, la clave ha sido expuesta. Descompratir implica volver a cifrar el fichero ya que hay que cambiar el kfile. Luego se vuelve a encriptar k2file y volver a encriptar para todos los usuarios

---- Minimo que hay que hacer
--- Ahora, despues pensar mecasnismos extras para subir nota

- Habiendo RSA, firmas datos es una medida que se puede implementar (por qejemplo dregistro de transacciones). IMP

- Control de acceso: token (ya hecho)
- 2FA topt para 
- Mecanismos de flow (mucho intentos de login, etc)
- Mecanismos de seguridad (cuanta más criptografía mejor)
- Mejoras visuales si sirven para hacer accesibles con la seguridad (QR para topt)


Tema 1,2 y 3 (ver supuesto prácticos)
---

## Propuesta: elementos criptográficos a añadir (análisis del 3-nov-2026)

Punto de partida del repo: canal TLS (paso 6), JWT con HMAC provisional
(paso 2), roles (paso 3) y tabla `USER_CARD` N:N con `isOwner` (paso 4).
Contraseñas y tarjetas siguen en texto claro. El modelo `CARD` + `USER_CARD`
ya es el que describen las notas: el dato cifrado una sola vez y la clave
envuelta una vez por usuario.

### Mínimo

| Elemento | Qué es | Estado |
| --- | --- | --- |
| Hash de contraseñas | scrypt o Argon2id con sal por usuario y pimienta global del servidor; comparación en tiempo constante. | No existe. Sustituye la línea `===` de `auth-service.js`. |
| Derivación en el cliente | De la contraseña se derivan `K_auth` (login) y `K_enc` (protege la clave privada). El servidor nunca recibe la contraseña ni `K_enc` (conocimiento cero). Equivale al 128 + 128 de las notas; con PBKDF2 + HKDF es estándar. | Diseñado en fase-1 D2, no implementado. |
| Par de claves por usuario | Generado en el navegador. Clave privada guardada en el servidor cifrada con `K_enc`, para entrar desde cualquier equipo. | Diseñado en fase-1, no implementado. |
| Cifrado híbrido de la tarjeta | `K_t` aleatoria de 256 bits; `E_AES-GCM(K_t, tarjeta)` una sola vez en `CARD`; `W_PK_u(K_t)` en cada fila de `USER_CARD`. | Diseñado en fase-1, no implementado. |
| Compartir | Insertar en `USER_CARD` la fila del nuevo usuario con `K_t` envuelta con su clave pública. | Previsto para fase 2. |
| Descompartir con rotación | Quitar la fila no basta: `K_t` ya fue expuesta. El propietario descifra, genera `K_t'`, recifra la tarjeta y la reenvuelve para los que quedan. Columna `version` que sube en cada rotación. | No está en ningún artefacto. |
| Firma asimétrica del JWT | Ed25519 o ES256 con el par del servidor. | Tareas 3.2 a 3.4 de `paso-2-middleware-jwt`, pendientes del equipo. |

RSA frente a curva elíptica (a justificar en la memoria): RSA-OAEP 3072 para
envolver `K_t`, porque coincide con la notación de clase `E_RSA_Ka(kfile)` y
es fácil de escribir; ECDSA P-256 o Ed25519 para firmar, por tamaño y
velocidad. Alternativa más moderna pero más difícil de explicar:
X25519 + HKDF + AES-KW.

### Extras para subir nota

- **Registro de transacciones firmado.** Cada operación sobre una tarjeta
  (alta, cambio, compartir, revocar) se guarda con
  `Sig_SK_usuario(hash_anterior ‖ operación ‖ timestamp)`. Encadenar los
  hashes lo hace no repudiable y a prueba de manipulación. Aprovecha las
  claves de firma que ya se van a tener.
- **Certificación de claves públicas por el servidor.**
  `Sig_SK_servidor(userId ‖ PK_u)`. Sin esto, quien controle la base de datos
  puede sustituir la clave pública de B y leer lo que A comparte con B.
- **2FA con TOTP y QR.** RFC 6238, secreto de 160 bits cifrado en reposo con
  una clave del servidor, QR en la activación.
- **Reto-respuesta asimétrico en el login.** El servidor firma un reto, el
  cliente lo verifica y responde firmado: posesión de la clave privada y
  autenticación del servidor más allá del certificado autofirmado (fase-1 D3).
- **Integridad explícita.** AES-GCM con datos asociados
  `cardId ‖ ownerId ‖ version`: impide mover un sobre cifrado a otra tarjeta
  o reutilizar una versión antigua tras una rotación.
- **Límite de intentos y tiempo constante.** Bloqueo progresivo por cuenta e
  IP; mismo error y mismo tiempo exista o no el email.
- **Revocación de tokens.** `jti` en el JWT y lista de revocados, o TTL corto
  con refresco, para cerrar sesión de verdad en el servidor.
- **Claves TLS cifradas con frase de paso y cabeceras HSTS/CSP.** Ya en
  "Trabajo futuro" de la memoria; baratas.

### Encaje en OpenSpec

El cambio `fase-1-registro-y-cifrado` se escribió antes de los pasos 1 a 6 y
ya no cuadra con el código (`POST /api/login`, cookies, recurso `notes`).
Mejor trocearlo en pasos del mismo tamaño que los anteriores, cada uno con su
parte [equipo] y [claude]:

1. Hash de contraseñas con sal y pimienta.
2. Derivación de claves en el cliente y par de claves por usuario con custodia cifrada.
3. Bóveda cifrada: cifrado híbrido de la tarjeta y migración del modelo.
4. Compartir y descompartir con rotación de `K_t`.
5. Firma asimétrica del JWT (ya planificada) y certificación de claves públicas.
6. TOTP con QR.
7. Registro de transacciones firmado.
8. Límite de intentos y revocación de tokens.

Los pasos 1 a 4 son el mínimo; del 5 en adelante son extras.
