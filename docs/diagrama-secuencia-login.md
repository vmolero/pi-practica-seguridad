# Diagrama de secuencia: inicio de sesión con cifrado

> **Estado:** propuesta de diseño. Hoy el login (`POST /api/public/login`)
> envía la contraseña y el servidor la compara en texto claro
> (`server/src/application/auth-service.js`). Este documento describe cómo
> debería ser el login cuando se implemente la capa de seguridad.
>
> **Parte de los datos que deja el alta.** El flujo de alta y la notación
> completa están en [diagrama-secuencia-alta-usuario.md](diagrama-secuencia-alta-usuario.md).
> Las fuentes son las mismas: los temas 1 a 4 de la asignatura y
> `docs/servidor-tener-encuenta.md`.

## Qué hay guardado antes del login

Tras el alta, la tabla `USER` tiene una fila por usuario con estos campos:

| Campo | Contenido |
|---|---|
| `email`, `name`, `isAdmin` | Datos de la cuenta. |
| `sal` | Sal aleatoria de 128 bits del usuario. |
| `h_L` | `KDF(K_L ‖ pimienta, sal)`, el hash lento de la clave de login. |
| `K_U` | Clave pública RSA `(n, e)`, en claro. |
| `VI`, `c_kU` | Clave privada cifrada: `c_kU = E_K_D(k_U)` con AES-128-CBC. |

La `pimienta` está en la configuración del servidor, no en la base de datos.

## Idea del login

1. El navegador vuelve a calcular `H(pw)` y obtiene las mismas dos mitades
   que en el alta: `K_L` y `K_D`. Es posible porque el hash es determinista.
2. Solo `K_L` viaja al servidor. El servidor repite el cálculo
   `KDF(K_L ‖ pimienta, sal)` y lo compara con `h_L`.
3. Si coincide, el servidor emite el JWT de sesión y devuelve `VI` y `c_kU`.
4. El navegador descifra la clave privada con `K_D`: `k_U = D_K_D(c_kU)`.
   El servidor nunca puede hacer este paso porque no conoce `K_D`.

## Notación adicional

Además de la del documento del alta:

| Símbolo | Significado |
|---|---|
| `h'_L` | Hash que calcula el servidor durante el login con la `K_L` recibida. |
| `=ct` | Comparación en tiempo constante (`crypto.timingSafeEqual`), para no filtrar información por el tiempo de respuesta. |
| `sal_falsa` | Sal ficticia para un email que no existe, para que el servidor tarde lo mismo. |
| `JWT` | Token de sesión firmado por el servidor (paso 2 del proyecto). |
| `r` | Valor aleatorio de prueba para comprobar que `k_U` corresponde a `K_U`. |

## Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant C as Cliente (navegador)
    participant I as API: capa de infraestructura<br/>(public-router, login-request)
    participant S as Capa de aplicación<br/>(auth-service)
    participant R as Repositorio de usuarios
    participant BD as Base de datos (tabla USER)
    participant T as Servicio de tokens<br/>(token-service)

    Note over C,I: Todo el tráfico va por HTTPS (TLS con un certificado<br/>autofirmado generado con OpenSSL).

    U->>C: Escribe el email y pw en la pantalla de login

    rect rgba(120, 160, 255, 0.15)
    Note over C: Derivación de las dos claves (igual que en el alta)
    C->>C: h = H(pw) = SHA3-256(pw), de 256 bits
    C->>C: K_L = h[0..127] (clave de login)
    C->>C: K_D = h[128..255] (clave de datos), se queda en memoria
    C->>C: Borra pw y h de la memoria
    end

    C->>I: POST /api/public/login { email, K_L }
    Note right of C: Nunca viajan pw ni K_D.

    I->>I: login-request: valida el cuerpo (formato del email<br/>y longitud de K_L) y normaliza el email
    alt La petición no es válida
        I-->>C: 400 Petición de login no válida
    end

    I->>S: login({ email, K_L })
    S->>R: findByEmail(email)
    R->>BD: SELECT ... WHERE email = ?
    BD-->>R: Fila del usuario o ninguna
    R-->>S: { id, name, isAdmin, sal, h_L, K_U, VI, c_kU } o null

    rect rgba(200, 140, 255, 0.15)
    Note over S: Comprobación de la clave de login con sal y pimienta
    alt El email no existe
        S->>S: h'_L = KDF(K_L ‖ pimienta, sal_falsa)<br/>(se calcula igualmente para tardar lo mismo)
        S-->>I: InvalidCredentialsError
        I-->>C: 401 Credenciales inválidas
    else El email existe
        S->>S: h'_L = KDF(K_L ‖ pimienta, sal)
        S->>S: Compara h'_L =ct h_L y descarta K_L
    end
    end

    alt h'_L distinto de h_L
        S-->>I: InvalidCredentialsError
        I-->>C: 401 Credenciales inválidas
        Note over C: Mismo mensaje que si el email no existe,<br/>para no revelar qué cuentas hay.
    end

    S->>T: sign({ sub: id, email, name, isAdmin })
    T-->>S: JWT (firmado, con iss, iat y exp)
    S-->>I: { token: JWT, user, K_U, VI, c_kU }
    I-->>C: 200 { token, user: { email, name, isAdmin }, K_U, VI, c_kU }

    rect rgba(255, 190, 110, 0.15)
    Note over C: Recuperación de la clave privada (solo en el navegador)
    C->>C: k_U = D_K_D(c_kU) con AES-128-CBC y el VI
    C->>C: Comprobación: r aleatorio, D_k_U(E_K_U(r)) = r
    alt Falla el descifrado o la comprobación
        C->>C: Borra JWT y K_D de la memoria
        C-->>U: "No se ha podido abrir tu clave privada"
    end
    C->>C: Borra K_D y guarda JWT, K_U y k_U solo en memoria<br/>(nada en localStorage, sessionStorage ni cookies)
    end

    C-->>U: Muestra el panel de tarjetas

    Note over C,S: Peticiones siguientes (middleware de autenticación)
    C->>I: GET /api/private/... con Authorization: Bearer JWT
    I->>T: auth-middleware: verify(JWT)
    alt El JWT no es válido o ha caducado
        T-->>I: InvalidTokenError
        I-->>C: 401 No autenticado
        C->>C: Borra JWT y k_U y vuelve al login
    else El JWT es válido
        T-->>I: claims (sub, email, name, isAdmin)
        I->>I: request.user = usuario de la sesión
        I-->>C: Respuesta con los datos cifrados del usuario
        C->>C: Los descifra con k_U
    end
```

## Qué sabe cada parte durante el login

| Dato | Navegador | Red (dentro de TLS) | Servidor |
|---|---|---|---|
| `pw` | Un instante, se borra tras el hash. | No viaja. | Nunca lo ve. |
| `K_D` | Hasta descifrar `c_kU`, luego se borra. | No viaja. | Nunca lo ve. |
| `K_L` | Un instante. | Viaja una vez. | Lo usa para calcular `h'_L` y lo descarta. |
| `sal`, `h_L`, `pimienta` | No los recibe. | No viajan. | Los usa para la comprobación. |
| `VI`, `c_kU`, `K_U` | Los recibe. | Viajan cifrados por TLS. | Los guarda, pero no puede abrir `c_kU`. |
| `k_U` | En memoria mientras dura la sesión. | No viaja. | Nunca lo ve. |
| `JWT` | En memoria mientras dura la sesión. | Viaja en cada petición. | Lo firma y lo verifica. |

Al recargar la página se pierden el JWT y `k_U`, igual que hoy se pierde el
token. Hay que volver a iniciar sesión.

## Puntos que hay que decidir

- **Enumeración de usuarios.** Con `sal_falsa` y el mismo error 401 el
  servidor tarda y responde igual exista o no el email. La `sal_falsa` puede
  ser fija o derivarse del email, por ejemplo `HMAC(pimienta, email)`.
- **Repetición de `K_L`.** `K_L` es siempre la misma para una contraseña. Si
  alguien la captura (por ejemplo, rompiendo el TLS), puede iniciar sesión
  sin saber la contraseña. No puede abrir `c_kU`, porque para eso necesita
  `K_D`. La mejora es un reto-respuesta: el servidor manda un valor aleatorio
  y el navegador lo firma con `k_U`.
- **Integridad de `c_kU`.** CBC no detecta modificaciones. Si el servidor
  altera `c_kU`, el descifrado da basura o falla el relleno. La comprobación
  con `r` evita usar una clave equivocada, pero AES-GCM o un MAC lo
  detectarían directamente.
- **Limitación de intentos.** Conviene limitar los intentos por email y por
  IP para frenar la fuerza bruta en línea.
- **Segundo factor.** El diseño de la fase 1 contempla TOTP. Si se añade, iría
  entre la comprobación de `h_L` y la emisión del JWT.
