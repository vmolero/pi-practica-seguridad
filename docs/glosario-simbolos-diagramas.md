# Correspondencia entre los símbolos de los diagramas y el glosario de clase

Esta tabla relaciona cada símbolo de los diagramas de secuencia con el término
y la notación que usan los apuntes de la asignatura (temas 1 a 4):

- [diagrama-secuencia-alta-usuario.md](diagrama-secuencia-alta-usuario.md) (**Alta**)
- [diagrama-secuencia-login.md](diagrama-secuencia-login.md) (**Login**)
- [diagrama-secuencia-crear-tarjeta.md](diagrama-secuencia-crear-tarjeta.md) (**Tarjeta**)

Temas de referencia:

- **T1:** Fundamentos de la protección de la información.
- **T2:** Introducción a la criptografía.
- **T3.1:** Criptografía simétrica: cifrado en flujo.
- **T3.2:** Criptografía simétrica: cifrado en bloque.
- **T4:** Criptografía con teoría de números.

## 1. Elementos de un criptosistema

| Símbolo en los diagramas | Término de clase | Notación de clase | Tema | Diagramas |
|---|---|---|---|---|
| `m_num`, `m_cad`, `m_cvv` | Texto en claro (mensaje en claro) | `m` | T1, T3, T4 | Tarjeta |
| `k_U` antes de cifrarla, `K_t` antes de envolverla | Texto en claro: lo que se cifra es una clave, pero para el algoritmo es el mensaje | `m` | T1, T4 | Alta, Tarjeta |
| `c_num`, `c_cad`, `c_cvv`, `c_kU`, `w_U` | Criptograma (texto cifrado) | `c` | T1 a T4 | Alta, Login, Tarjeta |
| `E_k(m)` | Transformación (función) de cifrado con la clave `k` | `Ek` | T1 | Todos |
| `D_k(c)` | Transformación de descifrado con la clave `k` | `Dk` | T1 | Login, Tarjeta |
| `K_L`, `K_D`, `K_t` | Clave, un elemento del espacio de claves | `k ∈ K` | T1 | Todos |
| Valores de 128 bits de `K_D` y `K_t` | Tamaño del espacio de claves: 2¹²⁸ claves posibles | `K` | T1 | Todos |
| HTTPS/TLS entre el cliente y la API | Canal seguro frente a canal inseguro | — | T1 | Todos |
| Cliente → servidor | Emisor → receptor (A → B, Alicia y Benito) | `A`, `B` | T1, T4 | Todos |
| Atacante que prueba contraseñas («fuerza bruta») | Criptoanalista, ataque de fuerza bruta | — | T1 | Alta, Login |

## 2. Criptografía simétrica (AES y modos de operación)

| Símbolo en los diagramas | Término de clase | Notación de clase | Tema | Diagramas |
|---|---|---|---|---|
| AES-128 | Algoritmo AES (Rijndael): bloque de 128 bits y clave de 128 bits, con 10 rondas | AES128 | T3.2 | Todos |
| `K_D`, `K_t` | Clave secreta de un criptosistema simétrico (la misma para cifrar y descifrar) | `k` | T1, T3 | Alta, Login, Tarjeta |
| CBC | Modo de encadenamiento de bloques cifrados (Cipher Block Chaining) | `c1 = Ek(m1⊕VI)`, `ci = Ek(mi⊕ci-1)` | T3.2 | Todos |
| `VI`, `VI_num`, `VI_cad`, `VI_cvv` | Vector de inicialización: un número aleatorio que puede ser público | `VI` | T3.2 | Todos |
| Relleno al cifrar con CBC | Relleno (padding) del último bloque | — | T3.2 | Todos |
| AES-GCM (mejora propuesta) | Se basa en el modo contador (CTR) | `[nonce ‖ contador]` | T3.2 (solo CTR) | Puntos que hay que decidir |
| `←` aleatorio (`VI`, `K_t`, `sal`, `r`) | Número aleatorio (secuencias pseudoaleatorias) | — | T3.1 | Todos |
| `‖` | Concatenación (en el modo CTR, `[nonce ‖ contador]`) | `‖` | T3.2 | Alta, Login |

## 3. Criptografía de clave pública (RSA)

| Símbolo en los diagramas | Término de clase | Notación de clase | Tema | Diagramas |
|---|---|---|---|---|
| `K_U = (n, e)` | Clave pública del usuario | `KA`, `KB` (`K = e`) | T4 | Alta, Login, Tarjeta |
| `k_U = d` | Clave privada del usuario | `kA`, `kB` (`k = d`) | T4 | Alta, Login, Tarjeta |
| `E_K_U(x)` | Cifrado con la clave pública del receptor: `c = m^e mod n` | `EKB(m)` | T4 | Login, Tarjeta |
| `D_k_U(c)` | Descifrado con la clave privada: `m = c^d mod n` | `DkB(c)` | T4 | Login, Tarjeta |
| `p`, `q` | Números primos grandes, elegidos al azar y secretos | `p`, `q` | T4 | Alta |
| `n = p·q` | Módulo RSA (problema de la factorización) | `n` | T4 | Alta |
| `Φ(n) = (p−1)(q−1)` | Función de Euler | `Φ(n)` | T4 | Alta |
| `e`, `mcd(e, Φ(n)) = 1` | Exponente público, primo con `Φ(n)` | `e` | T4 | Alta |
| `d = e⁻¹ mod Φ(n)` | Exponente privado: inverso de `e` módulo `Φ(n)` | `d·e mod Φ(n) = 1` | T2, T4 | Alta |
| `K_t` envuelta con `w_U = E_K_U(K_t)` | Clave de sesión (simétrica): la criptografía asimétrica solo cifra la clave de sesión | — | T4 | Tarjeta |
| `w_V = E_K_V(K_t)` (compartir en la fase 2) | Cifrar con la clave pública de cada receptor | `EKB` | T4 | Tarjeta |

## 4. Servicios de seguridad

| Lo que hace el diagrama | Término de clase | Tema |
|---|---|---|
| Cifrar los datos de la tarjeta y la clave privada | Confidencialidad | T1, T2 |
| Comprobar `K_L` en el login | Autenticidad | T1, T2 |
| Detectar si se ha modificado `c_kU` o `c_x` (CBC no lo hace; AES-GCM sí) | Integridad | T1, T2 |

## 5. Símbolos que no aparecen en los temas 1 a 4

Estos símbolos se usan en los diagramas, pero los apuntes de los temas 1 a 4
no los definen. Por el título de los apuntes, se verán en temas posteriores o
salen de las anotaciones de clase.

| Símbolo en los diagramas | Qué es | Dónde se verá u origen |
|---|---|---|
| `H(x)` (SHA3-256) | Función resumen (hash) | T5 *Funciones resumen* y anotaciones de clase |
| `KDF(x, sal)` (scrypt, bcrypt o Argon2) | Hash lento para guardar contraseñas | T5 y anotaciones de clase |
| `sal`, `sal_falsa` | Valor aleatorio por usuario que se añade antes del hash | Anotaciones de clase |
| `pimienta` | Valor aleatorio común a todos los usuarios, fuera de la base de datos | Anotaciones de clase |
| `h_L`, `h'_L` | Resumen guardado y resumen calculado de `K_L` | T5 |
| `=ct` | Comparación en tiempo constante | Práctica de implementación |
| `JWT` | Token de sesión firmado por el servidor | T6 *Firma digital* y T7 *Identidad digital* |
| Reto-respuesta firmado con `k_U` (mejora) | Autenticación con firma | T6 y T7 |
| Relleno OAEP de RSA | Relleno aleatorio para RSA | No aparece en los apuntes |
| `cardId` (UUID) | Identificador de la tarjeta | No es criptográfico |

## Posibles confusiones con la notación de clase

- **Mayúscula y minúscula de la clave.** En clase, `K` (mayúscula) es la clave
  pública y `k` (minúscula) la privada. Los diagramas siguen ese criterio:
  `K_U` es la pública y `k_U` la privada. En cambio, `K_L`, `K_D` y `K_t` son
  claves simétricas y van en mayúscula. Si se quiere evitar la ambigüedad en
  la memoria, se pueden escribir en minúscula (`k_L`, `k_D`, `k_t`).
- **`r`.** En el tema 4 `r = DkA(m)` es el resultado de «descifrar» con la
  clave privada para autenticar al emisor (la idea de la firma). En el login,
  `r` es solo un valor aleatorio de prueba. Conviene renombrarlo (por ejemplo,
  `m_prueba`) para no confundirlos.
- **`c`.** En clase `c` es siempre un criptograma. En los diagramas se
  mantiene: todo lo que empieza por `c_` está cifrado.
