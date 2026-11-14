# Diagrama de secuencia: un empleado crea una tarjeta

> **Estado:** implantado en el paso 10 (`paso-10-tarjetas-cifradas`). El
> código está en `client/src/security/tarjetas-cifradas.js` (cifrado y
> descifrado), `client/src/api/cards.js` (panel), `card-request.js`
> (validación estructural en el servidor) y `card-repository.js`
> (transacción). Respecto a la propuesta original se decidió AES-256-GCM con
> datos asociados en lugar de AES-128-CBC, y los nombres reales de los campos
> son `id`, `number.iv`, `number.ciphertext`, … y `wrappedKey`; ver «Puntos
> decididos» al final.
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
2. Cifra cada valor de la tarjeta con `K_t` (AES-256-GCM, con un `VI`
   aleatorio por valor y el `id` de la tarjeta y el nombre del campo como
   datos asociados). Así se cumple la anotación: «el JSON se envía en texto
   claro con los valores de cada clave cifrados».
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
| `K_t` | Clave AES-256 aleatoria de la tarjeta (32 bytes). |
| `VI_num`, `VI_cad`, `VI_cvv` | Vectores de inicialización aleatorios de 12 bytes, uno por valor cifrado. |
| `AAD_num`, `AAD_cad`, `AAD_cvv` | Datos asociados: `"<id>:number"`, `"<id>:expiry"`, `"<id>:cvv"`. Se autentican, no se cifran. |
| `c_num`, `c_cad`, `c_cvv` | Valores cifrados: `c_x = E_K_t(m_x)` con AES-256-GCM, `VI_x` y `AAD_x`; llevan la etiqueta de 128 bits. Miden 35, 23 y 20 bytes porque los textos se rellenan a 19, 7 y 4 caracteres. |
| `w_U` | Clave de la tarjeta envuelta para U: `w_U = E_K_U(K_t)` con RSA-OAEP (256 bytes). |
| `id` | UUID v4 de la tarjeta, generado en el navegador. En la API y en `CARD.id`. |

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
    C->>C: id ← UUID v4 aleatorio
    C->>C: K_t ← aleatoria de 256 bits (CryptoKey no exportable)
    C->>C: Rellena m_num a 19 caracteres y m_cvv a 4; m_cad es "MM/AAAA"
    C->>C: VI_num, VI_cad, VI_cvv ← aleatorios de 96 bits
    C->>C: c_num = E_K_t(m_num) con AES-256-GCM, VI_num y AAD "id:number"
    C->>C: c_cad = E_K_t(m_cad) con AES-256-GCM, VI_cad y AAD "id:expiry"
    C->>C: c_cvv = E_K_t(m_cvv) con AES-256-GCM, VI_cvv y AAD "id:cvv"
    end

    rect rgba(255, 190, 110, 0.15)
    Note over C: Envoltura de K_t con la clave pública del empleado
    C->>C: w_U = E_K_U(K_t) con RSA-OAEP (subtle.encrypt sobre los 32 bytes)
    C->>C: Pone a cero los bytes de K_t y suelta los valores en claro
    end

    C->>I: POST /api/private/cards<br/>Authorization: Bearer JWT<br/>{ id, number: { iv: VI_num, ciphertext: c_num }, expiry: { iv, ciphertext },<br/>cvv: { iv, ciphertext }, wrappedKey: w_U }  (todo en base64)
    Note right of C: Los nombres de los campos viajan en claro<br/>y sus valores cifrados. Nunca viajan m_x ni K_t.

    I->>I: auth-middleware: verifica el JWT (firma y caducidad)
    alt El JWT no es válido o ha caducado
        I-->>C: 401 No autenticado
        C->>C: Borra JWT y k_U y vuelve al login
    end
    I->>I: request.user = empleado (sale del JWT, nunca del cuerpo)

    I->>I: card-request: valida la estructura (id es un UUID v4,<br/>cada iv mide 12 bytes, c_num/c_cad/c_cvv miden 35/23/20<br/>y wrappedKey mide 256 bytes; ningún otro campo)
    alt La petición no es válida
        I-->>C: 400 Datos de tarjeta no válidos
    end

    I->>S: create(userId, { id, number, expiry, cvv, wrappedKey })
    S->>R: createForOwner(userId, { id, number, expiry, cvv, wrappedKey })

    rect rgba(200, 140, 255, 0.15)
    Note over R,BD: Una sola transacción
    R->>BD: INSERT INTO CARD (id, numberIv, numberCiphertext, expiryIv,<br/>expiryCiphertext, cvvIv, cvvCiphertext)
    R->>BD: INSERT INTO USER_CARD (userId, cardId, isOwner = true, wrappedKey)
    end
    alt id ya existe (de cualquier usuario)
        BD-->>R: SQLITE_CONSTRAINT_PRIMARYKEY
        R-->>S: DuplicateCardError
        S-->>I: CardConflictError
        I-->>C: 409 { error: "La tarjeta ya existe" }
    end
    BD-->>R: Filas insertadas
    R-->>S: tarjeta cifrada completa
    S-->>I: toEncryptedCard
    I-->>C: 201 { id, number: { iv, ciphertext }, expiry, cvv, wrappedKey, createdAt }
    Note left of I: El servidor devuelve exactamente lo que guarda.<br/>No puede calcular los 4 últimos dígitos (last4).

    C->>C: Descifra la respuesta como en el listado (abajo) y añade<br/>la tarjeta al panel con •••• last4 y MM/AA; vacía el formulario
    C-->>E: La tarjeta aparece en la lista

    Note over C,BD: Más tarde, al listar las tarjetas (GET /api/private/cards)
    C->>C: K_t = D_k_U(w_U); m_x = D_K_t(c_x) con VI_x y AAD_x; quita el relleno.<br/>Se queda con •••• last4 y MM/AA y descarta el resto.
    alt Alguna etiqueta o w_U no cuadra
        C-->>E: Fila "Tarjeta dañada: no se ha podido descifrar." (solo Eliminar)
    end
```

## Qué queda guardado y quién lo conoce

| Dato | Dónde está | ¿Lo conoce el servidor? |
|---|---|---|
| `m_num`, `m_cad`, `m_cvv` | Solo en el navegador, mientras se usan. | No |
| `K_t` | En ningún sitio en claro. Se recupera con `k_U` cuando hace falta (también para editar: los valores cambiados se cifran con la misma `K_t` y vectores nuevos). | No |
| `VI_x`, `c_x` | Tabla `CARD` (`numberIv`, `numberCiphertext`, …) | Sí, pero sin `K_t` no los puede descifrar, y GCM detecta cualquier cambio. |
| `w_U` | Tabla `USER_CARD`, columna `wrappedKey`, en la fila del propietario. | Sí, pero sin `k_U` no puede obtener `K_t`. |
| `k_U` | Solo en la memoria del navegador durante la sesión. En la base de datos está cifrada como `c_kU`. | No |

## Cambios hechos en el código (paso 10)

- **Esquema:** `CARD` ya no tiene `number`, `expiryMonth`, `expiryYear` ni
  `cvv`; tiene `numberIv`/`numberCiphertext`, `expiryIv`/`expiryCiphertext` y
  `cvvIv`/`cvvCiphertext`. `USER_CARD` tiene `wrappedKey`. La migración vacía
  las dos tablas: las tarjetas en claro no se migran, se vuelve a sembrar.
- **Validación:** las reglas de contenido (Luhn, caducidad y CVV) solo
  existen en el navegador (`client/src/validation/card.js`). El servidor
  comprueba formato y tamaños exactos.
- **Listado:** `toEncryptedCard` sustituye a `toMaskedCard`. El navegador
  recibe los valores cifrados y `wrappedKey`, descifra y enmascara él mismo.
- **El `id` lo genera el navegador** antes de cifrar, porque forma parte de
  los datos asociados de cada valor.
- **Edición:** `PATCH` sigue siendo parcial. El navegador abre `K_t` con
  `k_U` y cifra solo los valores cambiados con vectores nuevos; `wrappedKey`
  no cambia.

## Puntos decididos

- **Integridad: AES-256-GCM con datos asociados.** CBC no detectaba
  modificaciones; con GCM y `AAD_x = "<id>:<campo>"`, un servidor que altere
  un bit, intercambie los valores de dos tarjetas o mueva un valor a otro
  campo provoca un fallo de etiqueta y la fila aparece como «Tarjeta dañada».
  Lo que GCM no cubre: el servidor puede borrar o duplicar tarjetas enteras.
- **Relleno de RSA: OAEP** (SHA-256), con `subtle.encrypt` sobre los 32
  bytes de `K_t`, nunca RSA «de libro».
- **Caducidad cifrada.** Se cifra como `MM/AAAA`, como piden las anotaciones;
  el servidor no puede avisar de caducidades.
- **CVV.** Se guarda cifrado porque lo pide la práctica; PCI DSS lo prohíbe.
- **Tamaños fijos.** Los textos se rellenan (19, 7 y 4 caracteres) para que
  el tamaño del cifrado no revele la longitud del número ni si el CVV es de 4
  dígitos, y para que el servidor pueda exigir tamaños exactos.
- **Clave de 256 bits** para `K_t` (el diagrama original decía 128): no
  cuesta nada en Web Crypto. `K_D` sigue siendo de 128 bits porque la fija
  la derivación del enunciado.
