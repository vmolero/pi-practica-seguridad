import { toAdminUser } from '../domain/user.js';
import { DuplicateEmailError, SelfDeletionError, UserNotFoundError } from './errors.js';

/**
 * Servicio de administración de usuarios (panel del gestor).
 * Recibe un repositorio con list, findByEmail, findById, create, rename y
 * remove. Todo lo que devuelve pasa por toAdminUser: nunca la contraseña.
 */
export function createUserAdminService({ userRepository }) {
  return {
    async list() {
      return (await userRepository.list()).map(toAdminUser);
    },

    /**
     * Da de alta un usuario. Lanza DuplicateEmailError si el email ya existe.
     * Espera el email ya normalizado (sin espacios y en minúsculas).
     */
    async create({ name, email, password, isAdmin }) {
      if (await userRepository.findByEmail(email)) throw new DuplicateEmailError();

      // PROVISIONAL (paso 3): la contraseña inicial se guarda en texto claro,
      // igual que la compara el login. La capa de seguridad la sustituirá.
      try {
        return toAdminUser(await userRepository.create({ name, email, password, isAdmin }));
      } catch (error) {
        // Dos altas simultáneas con el mismo email: lo detecta el índice único.
        if (String(error.code).startsWith('SQLITE_CONSTRAINT')) throw new DuplicateEmailError();
        throw error;
      }
    },

    /**
     * Cambia el nombre y devuelve el usuario actualizado.
     */
    async rename(id, name) {
      if (!(await userRepository.rename(id, name))) throw new UserNotFoundError();
      return toAdminUser(await userRepository.findById(id));
    },

    /**
     * Borra un usuario. Un administrador no puede borrarse a sí mismo.
     */
    async remove(id, { actingUserId }) {
      if (id === actingUserId) throw new SelfDeletionError();
      if (!(await userRepository.remove(id))) throw new UserNotFoundError();
    },
  };
}
