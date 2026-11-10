import { deleteCardsOwnedBy } from './card-repository.js';

const ADMIN_COLUMNS = ['id', 'name', 'email', 'isAdmin'];

/**
 * Repositorio de usuarios sobre la tabla USER.
 * El email se guarda siempre en minúsculas, así que se busca por igualdad exacta.
 */
export function createUserRepository(knex) {
  return {
    /**
     * Para el login: trae la sal y el hash de la clave de login y el material
     * de claves del usuario (K_U, VI, c_kU), que se devuelve al propio
     * usuario una vez verificada su clave de login.
     */
    async findByEmail(email) {
      return knex('USER')
        .select(
          'id', 'name', 'email', 'isAdmin', 'loginKeySalt', 'loginKeyHash',
          'publicKey', 'encryptedPrivateKey', 'privateKeyIv',
        )
        .where({ email })
        .first();
    },

    async findById(id) {
      return knex('USER').select(ADMIN_COLUMNS).where({ id }).first();
    },

    /**
     * Todos los usuarios ordenados por id, sin la contraseña.
     */
    async list() {
      return knex('USER').select(ADMIN_COLUMNS).orderBy('id');
    },

    /**
     * Inserta un usuario con la sal y el hash de su clave de login y su
     * material de claves, y lo devuelve sin nada de eso. Si el email ya
     * existe, propaga el error de restricción única de SQLite.
     */
    async create({
      name, email, isAdmin, loginKeySalt, loginKeyHash, publicKey, encryptedPrivateKey, privateKeyIv,
    }) {
      const [created] = await knex('USER')
        .insert({
          name, email, isAdmin, loginKeySalt, loginKeyHash, publicKey, encryptedPrivateKey, privateKeyIv,
        })
        .returning(ADMIN_COLUMNS);
      return created;
    },

    /**
     * Cambia el nombre. Devuelve true si el usuario existía.
     */
    async rename(id, name) {
      return (await knex('USER').where({ id }).update({ name })) > 0;
    },

    /**
     * Borra el usuario y, en la misma transacción, las tarjetas de las que es
     * propietario (la cascada elimina sus filas de USER_CARD). Devuelve true
     * si existía.
     */
    async remove(id) {
      return knex.transaction(async (trx) => {
        await deleteCardsOwnedBy(trx, id);
        return (await trx('USER').where({ id }).del()) > 0;
      });
    },
  };
}
