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
  };
}
