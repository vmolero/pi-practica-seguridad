// Fallo de autenticación. Es el mismo error tanto si el email no existe como si
// la contraseña no coincide, para no revelar cuál de los dos falla.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Credenciales inválidas');
    this.name = 'InvalidCredentialsError';
  }
}

// Token de sesión ausente de forma, manipulado, firmado con otra clave, con un
// algoritmo no admitido o caducado. No se distingue la causa.
export class InvalidTokenError extends Error {
  constructor(message = 'Token inválido') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}
