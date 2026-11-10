EL examen esta programado para como mucho 1 hora
* Preguntas de teoría
* Ejercicios del estilo que se ven en el borrador de ejercicios

5-6 preguntas en papel teoría + problemas

papel lápiz/boli. Calculadora

Tema 1
---

Definición de conceptos (criptogradía, criptologái, etc)

Tema 2
---

Hay algo de teoría, pero más cuestiones matemáticas. Más de clave pública

Algoritmo extendido de euclides/calcular el inverso (utilizado en RSA)

Calcular inversos es el típico ejercicio

11-1 mod 28

Encontrar un numero que multiplicado por 11 de 1 en mod 28

28 = 11x + y

28 = 11.2 + 6
11 = 6.1 + 5
 6 = 5.1 + 1 <-- el 1 se ha encontrado

 Ahora

 6 = 28 - 11.2 mod 28 28 se va
   = 11.(-2) mod 28

 5 = 11 - 1.6 mod 28 
   = 11 + 2.11 mod 28
   = 3.11 mod 28

 1 = 6 - 1.5 mod 28
   = (-2).11 - 1 .(3).11 mod 28
   = (-5).11 mod 28 
   = 23.11 mod 28 // Luego 23 es el inverso

Recordar aritmética modular
   X mod X = 0
   -X mod Y = Y-X


No es habitual estudio de frecuencias pq es muy laborioso (pero podría salir algo de teoría al respecto) Criptoanálisis por estudio de frecuencias: si la aparición de los caracteres posee la misma frecuencia que lo encriptado, ie conceptos.

Saber aplicar Vernan para aplicar en cifradores en flujos (hacer un XOR)

Tema 3
---

Simétrica: Cifrado en flujo

Aplicar RC4 es importante. NO recordarlo de memoria, pero saber aplicarlo Por ejemplo hacer un Rc4 completo o buscar, cuantas iteraciones haría falta para hacer un cifrado. Hay que entenderlo! KSA (sacar los bits por iteración) + PRGA (tener en cta cuando hay que acabar)

Ver ejemplos

Método Vernan

LFSRs pueden salir, pero no suele ser de los más importan. El concepto sí tiene qu estar claro.

Simétrica: Cifrado en bloque (AES y modos de cifrado) Conocer las fases, pero no aplicarlo.

Calculo de romper claves por fuerza bruta.

Teoría: explansión de clave, ecuaciones de recurrencia. Notacion matematica para expresar el cifrado. (no creen que puedan caer, pero luego dice que sí)


AES: nos dan la s-caja y preguntar que completemos algo en X iteración.

Swift rows (muy tipico)

Mixcolumns: require más operaciones matemáticas, (no suele salir)

Tener claro conceptos cifradores cual es más conveniente en funcion de la situación.

Examen:
2 teoría
1 rc4
1 calcular inverso con cifrador afin
1 aes o similar