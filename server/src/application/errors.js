// Fallo de autenticación. Es el mismo error tanto si el email no existe como si
// la contraseña no coincide, para no revelar cuál de los dos falla.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Credenciales inválidas');
    this.name = 'InvalidCredentialsError';
  }
}
