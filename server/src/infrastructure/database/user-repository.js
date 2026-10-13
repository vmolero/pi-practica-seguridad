const ADMIN_COLUMNS = ['id', 'name', 'email', 'isAdmin'];

/**
 * Repositorio de usuarios sobre la tabla USER.
 * El email se guarda siempre en minúsculas, así que se busca por igualdad exacta.
 */
export function createUserRepository(knex) {
  return {
    async findByEmail(email) {
      return knex('USER')
        .select('id', 'name', 'email', 'password', 'isAdmin')
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
     * Inserta un usuario y lo devuelve sin la contraseña. Si el email ya
     * existe, propaga el error de restricción única de SQLite.
     */
    async create({ name, email, password, isAdmin }) {
      const [created] = await knex('USER')
        .insert({ name, email, password, isAdmin })
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
     * Borra el usuario. Devuelve true si existía.
     */
    async remove(id) {
      return (await knex('USER').where({ id }).del()) > 0;
    },
  };
}
