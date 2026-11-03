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