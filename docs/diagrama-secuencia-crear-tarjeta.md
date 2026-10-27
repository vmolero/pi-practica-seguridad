# Diagrama de secuencia: un empleado crea una tarjeta

> **Estado:** propuesta de diseño. Hoy el alta de tarjeta
> (`POST /api/private/cards`) envía el número, la caducidad y el CVV en texto
> claro, y el servidor los guarda tal cual en la tabla `CARD`
> (`server/src/application/card-service.js`). Este documento describe cómo
> debería ser cuando se implemente la capa de seguridad.
>
> **Parte del estado que deja el login.** El navegador ya tiene en memoria el
> JWT, la clave pública `K_U` y la clave privada `k_U` del empleado. Ver
> [diagrama-secuencia-alta-usuario.md](diagrama-secuencia-alta-usuario.md) y
> [diagrama-secuencia-login.md](diagrama-secuencia-login.md).
> Las fuentes son las mismas: los temas 1 a 4 de la asignatura y
> `docs/servidor-tener-encuenta.md`.

## Idea

Se usa un **cifrado híbrido**, como describe el tema 4. La criptografía de
clave pública es lenta para cifrar datos, así que se usa solo para cifrar una
clave simétrica de sesión:

1. El navegador genera una clave AES aleatoria `K_t`, distinta para cada
   tarjeta.
2. Cifra cada valor de la tarjeta con `K_t` (AES-128-CBC, con un `VI`
   aleatorio por valor). Así se cumple la anotación: «el JSON se envía en
   texto claro con los valores de cada clave cifrados».
3. Envuelve `K_t` con la clave pública del empleado: `w_U = E_K_U(K_t)`
   (RSA). Solo `k_U` puede abrirla.
4. El servidor guarda los valores cifrados en `CARD` y `w_U` en `USER_CARD`,
   que es la relación entre el usuario y la tarjeta. El servidor no puede
   leer nada.

Guardar la clave envuelta en `USER_CARD`, y no en `CARD`, prepara la fase 2.
Para compartir una tarjeta con otro usuario V basta con añadir una fila con
`w_V = E_K_V(K_t)`, sin volver a cifrar los datos.

## Notación adicional

Además de la de los documentos del alta y del login:

| Símbolo | Significado |
|---|---|
| `m_num`, `m_cad`, `m_cvv` | Valores en claro: el número, la caducidad (`MM/AAAA`) y el CVV. |
| `K_t` | Clave AES-128 aleatoria de la tarjeta. |
| `VI_num`, `VI_cad`, `VI_cvv` | Vectores de inicialización aleatorios, uno por valor cifrado. |
| `c_num`, `c_cad`, `c_cvv` | Valores cifrados: `c_x = E_K_t(m_x)` con AES-128-CBC y `VI_x`. |
| `w_U` | Clave de la tarjeta envuelta para U: `w_U = E_K_U(K_t) = K_t^e mod n`. |
| `cardId` | UUID de la tarjeta, generado en el navegador. |

## Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor E as Empleado
    participant C as Cliente (navegador)
    participant I as API: capa de infraestructura<br/>(auth-middleware, cards-router,<br/>card-request)
    participant S as Capa de aplicación<br/>(card-service)
    participant R as Repositorio de tarjetas
    participant BD as Base de datos<br/>(tablas CARD y USER_CARD)

    Note over C: Tras el login, en memoria: JWT, K_U y k_U.
    Note over C,I: Todo el tráfico va por HTTPS (TLS con un certificado<br/>autofirmado generado con OpenSSL).

    E->>C: En el panel de tarjetas pulsa "Nueva tarjeta"
    E->>C: Escribe el número, la caducidad y el CVV

    C->>C: Valida en el navegador: Luhn del número,<br/>caducidad no vencida y CVV de 3 o 4 dígitos
    Note right of C: El servidor ya no puede validar el contenido<br/>porque solo recibe valores cifrados.
    alt Los datos no son válidos
        C-->>E: Marca los campos con error
    end

    rect rgba(120, 220, 160, 0.15)
    Note over C: Clave de la tarjeta y cifrado de cada valor
    C->>C: cardId ← UUID aleatorio
    C->>C: K_t ← aleatoria de 128 bits
    C->>C: VI_num, VI_cad, VI_cvv ← aleatorios de 128 bits
    C->>C: c_num = E_K_t(m_num) con AES-128-CBC y VI_num
    C->>C: c_cad = E_K_t(m_cad) con AES-128-CBC y VI_cad
    C->>C: c_cvv = E_K_t(m_cvv) con AES-128-CBC y VI_cvv
    end

    rect rgba(255, 190, 110, 0.15)
    Note over C: Envoltura de K_t con la clave pública del empleado
    C->>C: w_U = E_K_U(K_t) con RSA (relleno OAEP)
    C->>C: Borra K_t y los valores en claro de la memoria
    end

    C->>I: POST /api/private/cards<br/>Authorization: Bearer JWT<br/>{ cardId, number: { VI_num, c_num }, expiry: { VI_cad, c_cad },<br/>cvv: { VI_cvv, c_cvv }, key: w_U }
    Note right of C: Los nombres de los campos viajan en claro<br/>y sus valores cifrados. Nunca viajan m_x ni K_t.

    I->>I: auth-middleware: verifica el JWT (firma y caducidad)
    alt El JWT no es válido o ha caducado
        I-->>C: 401 No autenticado
        C->>C: Borra JWT y k_U y vuelve al login
    end
    I->>I: request.user = empleado (sale del JWT, nunca del cuerpo)

    I->>I: card-request: valida la estructura (cardId es un UUID,<br/>cada VI mide 16 bytes, cada c_x es múltiplo de 16 bytes<br/>y w_U mide lo mismo que el módulo n)
    alt La petición no es válida
        I-->>C: 400 Datos de tarjeta no válidos
    end

    I->>S: create(userId, { cardId, number, expiry, cvv, key: w_U })
    S->>R: createForOwner(userId, tarjeta cifrada, w_U)

    rect rgba(200, 140, 255, 0.15)
    Note over R,BD: Una sola transacción
    R->>BD: INSERT INTO CARD (id, VI_num, c_num, VI_cad, c_cad, VI_cvv, c_cvv)
    R->>BD: INSERT INTO USER_CARD (userId, cardId, isOwner = true, w_U)
    end
    alt cardId ya existe
        BD-->>R: SQLITE_CONSTRAINT
        R-->>S: Error
        S-->>I: Conflicto
        I-->>C: 409 La tarjeta ya existe
    end
    BD-->>R: Filas insertadas
    R-->>S: { id, createdAt }
    S-->>I: { id, createdAt }
    I-->>C: 201 { id, createdAt }
    Note left of I: El servidor ya no puede devolver los 4 últimos<br/>dígitos (last4): no conoce el número.

    C->>C: Añade la tarjeta al panel con los últimos 4 dígitos,<br/>que todavía tiene en el formulario, y vacía el formulario
    C-->>E: "Tarjeta guardada"

    Note over C,BD: Más tarde, al listar las tarjetas (GET /api/private/cards)
    C->>C: K_t = D_k_U(w_U) y m_x = D_K_t(c_x) con su VI_x,<br/>para mostrar el número enmascarado y la caducidad
```

## Qué queda guardado y quién lo conoce

| Dato | Dónde está | ¿Lo conoce el servidor? |
|---|---|---|
| `m_num`, `m_cad`, `m_cvv` | Solo en el navegador, mientras se usan. | No |
| `K_t` | En ningún sitio en claro. Se recupera con `k_U` cuando hace falta. | No |
| `VI_x`, `c_x` | Tabla `CARD` | Sí, pero sin `K_t` no los puede descifrar. |
| `w_U` | Tabla `USER_CARD`, en la fila del propietario. | Sí, pero sin `k_U` no puede obtener `K_t`. |
| `k_U` | Solo en la memoria del navegador durante la sesión. En la base de datos está cifrada como `c_kU`. | No |

## Cambios que implica en el código actual

- **Esquema:** `CARD` deja de tener `number`, `expiryMonth`, `expiryYear` y
  `cvv` en claro y pasa a tener los pares `VI_x`/`c_x`. `USER_CARD` añade la
  columna `w_U` (clave envuelta).
- **Validación:** las reglas de `card-request.js` sobre el contenido (Luhn,
  caducidad y CVV) pasan al navegador. El servidor solo comprueba formatos y
  tamaños.
- **Listado:** `toMaskedCard` ya no puede calcular `last4` en el servidor. El
  navegador recibe los valores cifrados y `w_U`, y enmascara el número él
  mismo.
- **El `cardId` lo genera el navegador** antes de cifrar, para poder ligarlo
  a los datos cifrados si se usa AES-GCM (ver más abajo).

## Puntos que hay que decidir

- **Integridad.** CBC no detecta modificaciones. Un servidor malicioso podría
  intercambiar los valores cifrados de dos tarjetas o alterar bits del VI.
  AES-GCM con `cardId` como dato autenticado adicional (AAD) lo detectaría.
- **Relleno de RSA.** `w_U` debe usar RSA con relleno OAEP, no RSA «de libro»
  (`K_t^e mod n` sin relleno), que es determinista y maleable.
- **Caducidad cifrada o en claro.** Cifrarla oculta más información, pero
  impide que el servidor avise de las tarjetas a punto de caducar. Las
  anotaciones piden cifrar todos los valores, que es lo que muestra el
  diagrama.
- **CVV.** En un sistema real no se debería guardar (lo prohíbe PCI DSS).
  Aquí se guarda cifrado porque lo pide la práctica.
