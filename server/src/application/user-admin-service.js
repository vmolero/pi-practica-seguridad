import { toAdminUser } from '../domain/user.js';
import { DuplicateEmailError, SelfDeletionError, UserNotFoundError } from './errors.js';

/**
 * Servicio de administración de usuarios (panel del gestor).
 * Recibe un repositorio con list, findByEmail, findById, create, rename y
 * remove, y el servicio de clave de login (newSalt, hash). Todo lo que
 * devuelve pasa por toAdminUser: nunca la sal, el hash ni el material de
 * claves.
 */
export function createUserAdminService({ userRepository, loginKeyService }) {
  return {
    async list() {
      return (await userRepository.list()).map(toAdminUser);
    },

    /**
     * Da de alta un usuario a partir de su clave de login K_L (Uint8Array de
     * 16 bytes) y su par de claves (publicKey en claro, encryptedPrivateKey y
     * privateKeyIv tal como los cifró el navegador). Guarda una sal nueva y
     * h_L = KDF(K_L ‖ pimienta, sal); K_L se descarta.
     * Lanza DuplicateEmailError si el email ya existe.
     * Espera el email ya normalizado (sin espacios y en minúsculas).
     */
    async create({ name, email, loginKey, isAdmin, publicKey, encryptedPrivateKey, privateKeyIv }) {
      if (await userRepository.findByEmail(email)) throw new DuplicateEmailError();

      const loginKeySalt = loginKeyService.newSalt();
      const loginKeyHash = await loginKeyService.hash(loginKey, loginKeySalt);

      try {
        return toAdminUser(await userRepository.create({
          name, email, isAdmin, loginKeySalt, loginKeyHash, publicKey, encryptedPrivateKey, privateKeyIv,
        }));
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
