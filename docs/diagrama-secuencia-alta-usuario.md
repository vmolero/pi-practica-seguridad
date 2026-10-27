# Diagrama de secuencia: alta de usuario con cifrado

> **Estado:** propuesta de diseño. El proyecto todavía no cifra nada: hoy el
> alta (`POST /api/private/admin/users`) guarda la contraseña en texto claro
> (`server/src/application/user-admin-service.js`). Este documento describe
> cómo debería ser el alta cuando se implemente la capa de seguridad.
>
> **Fuentes:** temas 1 a 4 de la asignatura (fundamentos, introducción a la
> criptografía, cifrado en flujo y en bloque, y criptografía con teoría de
> números) y las anotaciones de clase en `docs/servidor-tener-encuenta.md`.

## Escenario

El alta se hace **en persona**. El administrador ha iniciado sesión en el
panel de administración y le deja el teclado al nuevo usuario para que
escriba su contraseña. Ni el administrador ni el servidor llegan a ver la
contraseña.

La idea central de las anotaciones:

1. La contraseña se resume con un hash de 256 bits: `H(pw)`.
2. Ese resumen se parte en dos mitades de 128 bits:
   - `K_L` es la **clave de login**. Viaja al servidor, que solo guarda un
     hash de ella con sal y pimienta.
   - `K_D` es la **clave de datos**. Nunca sale del navegador y cifra la
     clave privada del usuario.
3. El navegador genera el par de claves RSA del usuario. La clave pública se
   guarda en claro en la base de datos. La clave privada se guarda cifrada
   con `K_D`.

Así el servidor no tiene información suficiente para obtener `K_D` ni la
clave privada (conocimiento cero).

## Notación

Se sigue la notación de los temas 1 a 4.

| Símbolo | Significado |
|---|---|
| `pw` | Contraseña que escribe el usuario. |
| `H(x)` | Función resumen SHA3-256 (salida de 256 bits). |
| `‖` | Concatenación. |
| `K_L` | Clave de login: los 128 bits altos de `H(pw)`. |
| `K_D` | Clave de datos: los 128 bits bajos de `H(pw)`. |
| `p, q` | Primos grandes aleatorios de RSA (secretos). |
| `n = p·q` | Módulo RSA. |
| `Φ(n) = (p−1)(q−1)` | Función de Euler de `n` (secreta). |
| `e` | Exponente público, con `mcd(e, Φ(n)) = 1`. |
| `d` | Exponente privado: `d·e mod Φ(n) = 1`. |
| `K_U = (n, e)` | Clave pública del usuario U: `E_K_U(m) = m^e mod n`. |
| `k_U = d` | Clave privada del usuario U: `D_k_U(c) = c^d mod n`. |
| `E_k(m)` / `D_k(c)` | Cifrado y descifrado simétrico con la clave `k` (AES-128). |
| `VI` | Vector de inicialización aleatorio de 128 bits (modo CBC). |
| `c_kU` | Clave privada cifrada: `E_K_D(k_U)` con AES-128-CBC y `VI`. |
| `sal` | Valor aleatorio distinto para cada usuario, guardado en la tabla. |
| `pimienta` | Valor aleatorio común a todos los usuarios. Se guarda fuera de la base de datos, en la configuración del servidor. |
| `KDF(x, sal)` | Hash lento para guardar contraseñas: scrypt, bcrypt o Argon2. |
| `h_L` | Lo que se guarda para comprobar el login: `KDF(K_L ‖ pimienta, sal)`. |

## Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario nuevo
    actor A as Administrador
    participant C as Cliente (navegador)
    participant I as API: capa de infraestructura<br/>(auth-middleware, require-admin,<br/>admin-router, user-request)
    participant S as Capa de aplicación<br/>(user-admin-service)
    participant R as Repositorio de usuarios
    participant BD as Base de datos (tabla USER)

    Note over A,C: El administrador ya ha iniciado sesión.<br/>El cliente guarda su JWT en memoria.
    Note over C,I: Todo el tráfico va por HTTPS (TLS con un certificado<br/>autofirmado generado con OpenSSL).

    A->>C: Abre el panel de administración y pulsa "Nuevo usuario"
    A->>C: Escribe el nombre, el email y el rol (isAdmin)
    A->>U: Le deja el teclado
    U->>C: Escribe pw dos veces (contraseña y confirmación)
    C->>C: Comprueba que coinciden y que pw cumple la política mínima

    rect rgba(120, 160, 255, 0.15)
    Note over C: Derivación de las dos claves (solo en el navegador)
    C->>C: h = H(pw) = SHA3-256(pw), de 256 bits
    C->>C: K_L = h[0..127] (clave de login)
    C->>C: K_D = h[128..255] (clave de datos)
    end

    rect rgba(120, 220, 160, 0.15)
    Note over C: Generación del par de claves RSA del usuario
    C->>C: Elige p y q primos grandes y calcula n = p·q y Φ(n) = (p−1)(q−1)
    C->>C: Elige e con mcd(e, Φ(n)) = 1 y calcula d = e⁻¹ mod Φ(n)
    C->>C: K_U = (n, e) es la clave pública y k_U = d la privada
    end

    rect rgba(255, 190, 110, 0.15)
    Note over C: Protección de la clave privada con K_D
    C->>C: VI ← aleatorio de 128 bits
    C->>C: c_kU = E_K_D(k_U) con AES-128-CBC y el VI
    C->>C: Borra de la memoria pw, h, K_D, k_U, p, q y Φ(n)
    end

    C->>I: POST /api/private/admin/users<br/>Authorization: Bearer JWT_admin<br/>{ name, email, isAdmin, K_L, K_U, VI, c_kU }
    Note right of C: Nunca viajan pw, K_D ni k_U en claro.

    I->>I: auth-middleware: verifica el JWT (firma y caducidad)
    alt El JWT no es válido o ha caducado
        I-->>C: 401 No autenticado
    end
    I->>I: require-admin: comprueba que el usuario tiene isAdmin = true
    alt No es administrador
        I-->>C: 403 Prohibido
    end
    I->>I: user-request: valida el cuerpo (formato del email,<br/>longitud de K_L, K_U, VI y c_kU) y normaliza el email
    alt La petición no es válida
        I-->>C: 400 Datos de usuario no válidos
    end

    I->>S: create({ name, email, isAdmin, K_L, K_U, VI, c_kU })
    S->>R: findByEmail(email)
    R->>BD: SELECT ... WHERE email = ?
    BD-->>R: Sin filas
    R-->>S: null
    alt El email ya existe
        S-->>I: DuplicateEmailError
        I-->>C: 409 El email ya existe
    end

    rect rgba(200, 140, 255, 0.15)
    Note over S: Almacenamiento de la clave de login con sal y pimienta
    S->>S: sal ← aleatoria de 128 bits (una por usuario)
    S->>S: h_L = KDF(K_L ‖ pimienta, sal) con scrypt, bcrypt o Argon2
    S->>S: Descarta K_L
    end

    S->>R: create({ name, email, isAdmin, sal, h_L, K_U, VI, c_kU })
    R->>BD: INSERT INTO USER (name, email, isAdmin, sal, h_L, K_U, VI, c_kU)
    BD-->>R: id
    R-->>S: Usuario creado
    S-->>I: toAdminUser(usuario), sin sal, h_L ni c_kU
    I-->>C: 201 { id, name, email, isAdmin }
    C-->>A: "Usuario dado de alta"
    A-->>U: El alta ha terminado y ya puede iniciar sesión
```

## Qué queda guardado y quién lo conoce

| Dato | Dónde está | ¿Lo conoce el servidor? |
|---|---|---|
| `pw` | Solo en la cabeza del usuario. | No |
| `K_D`, `k_U` | En ningún sitio en claro. Se recalculan o se descifran en el navegador al iniciar sesión. | No |
| `K_L` | Viaja por TLS durante el alta y el login. Se descarta tras calcular `h_L`. | Solo de paso, no lo guarda |
| `sal`, `h_L` | Tabla `USER` | Sí, pero solo sirven para comprobar `K_L` |
| `pimienta` | Configuración del servidor, fuera de la base de datos | Sí |
| `K_U` | Tabla `USER`, en claro | Sí (es pública) |
| `VI`, `c_kU` | Tabla `USER` | Sí, pero sin `K_D` no puede descifrar `k_U` |

Al iniciar sesión el navegador recalcula `H(pw)` y obtiene de nuevo `K_L` y
`K_D`. Envía `K_L` para autenticarse, recibe `VI` y `c_kU`, y descifra la
clave privada con `k_U = D_K_D(c_kU)`. Después usa `K_U` y `k_U` para cifrar y
descifrar los datos de sus tarjetas. El detalle está en
[diagrama-secuencia-login.md](diagrama-secuencia-login.md).

## Puntos que hay que decidir

- **Sal en el hash del cliente.** Las anotaciones piden un hash
  determinista: `H(pw)` sin sal. Pero entonces dos usuarios con la misma
  contraseña tienen la misma `K_D`. Además, si se filtra la base de datos,
  `c_kU` se puede atacar por fuerza bruta probando contraseñas con SHA3, que
  es muy rápido. La mejora es usar `H(pw ‖ email)` o, mejor, un KDF lento
  también en el cliente (PBKDF2 o Argon2).
- **Modo de cifrado de `k_U`.** El tema 3 presenta CBC con VI. CBC protege la
  confidencialidad, pero no detecta si alguien ha modificado `c_kU`. Como
  mejora se puede añadir un MAC o usar AES-GCM.
- **Tamaño de RSA.** El navegador debe generar como mínimo un módulo de
  2048 bits (mejor 3072). Se puede usar Web Crypto (`RSA-OAEP`).
- **Valores de 128 bits.** `K_D` de 128 bits es suficiente para AES-128.
  Si se quisiera AES-256 habría que derivar más bits (por ejemplo, con
  SHA3-512).
