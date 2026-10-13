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

// El usuario indicado no existe (o su identificador no tiene un formato válido).
export class UserNotFoundError extends Error {
  constructor() {
    super('Usuario no encontrado');
    this.name = 'UserNotFoundError';
  }
}

// Ya hay otro usuario con el mismo email.
export class DuplicateEmailError extends Error {
  constructor() {
    super('Ya existe un usuario con ese email');
    this.name = 'DuplicateEmailError';
  }
}

// Un administrador intenta eliminar su propia cuenta.
export class SelfDeletionError extends Error {
  constructor() {
    super('No puedes eliminar tu propia cuenta');
    this.name = 'SelfDeletionError';
  }
}

// La tarjeta no existe, su identificador no tiene formato válido o no está
// relacionada con el usuario: no se distingue entre los tres casos.
export class CardNotFoundError extends Error {
  constructor() {
    super('Tarjeta no encontrada');
    this.name = 'CardNotFoundError';
  }
}

// El usuario ve la tarjeta pero no es su propietario (tarjeta compartida, fase 2).
export class CardForbiddenError extends Error {
  constructor() {
    super('Acceso denegado');
    this.name = 'CardForbiddenError';
  }
}
