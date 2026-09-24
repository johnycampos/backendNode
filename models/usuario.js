const { pool } = require('../db');

class Usuario {
  /**
   * Cria um novo usuário vinculado a uma loja
   */
  static async criar({ username, password, role, loja_id }) {
    const query = `
      INSERT INTO users (username, password, role, loja_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, role, loja_id
    `;
    const values = [username, password, role, loja_id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Busca usuário por username (incluindo senha para autenticação)
   */
  static async buscarPorUsername(username) {
    const query = `
      SELECT u.id, u.username, u.password, u.role, u.loja_id, l.nome as loja_nome, l.is_matriz
      FROM users u
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE u.username = $1
    `;
    const result = await pool.query(query, [username]);
    return result.rows[0];
  }

  /**
   * Busca usuário por ID (sem expor a senha)
   */
  static async buscarPorId(id) {
    const query = `
      SELECT u.id, u.username, u.role, u.loja_id, l.nome as loja_nome, l.is_matriz
      FROM users u
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE u.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Lista usuários. Se loja_id for informado, filtra pela loja;
   * se null (ex.: super_admin), retorna de todas as lojas.
   */
  static async listarPorLoja(loja_id = null) {
    let query = `
      SELECT u.id, u.username, u.role, u.loja_id, l.nome as loja_nome, l.is_matriz
      FROM users u
      LEFT JOIN lojas l ON u.loja_id = l.id
    `;
    const values = [];

    if (loja_id) {
      query += ` WHERE u.loja_id = $1`;
      values.push(loja_id);
    }

    query += ` ORDER BY u.username ASC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Atualiza dados de um usuário
   */
  static async atualizar(id, { username, role, loja_id, password }) {
    if (password) {
      const query = `
        UPDATE users
        SET username = $1, role = $2, loja_id = $3, password = $4
        WHERE id = $5
        RETURNING id, username, role, loja_id
      `;
      const result = await pool.query(query, [username, role, loja_id, password, id]);
      return result.rows[0];
    }

    const query = `
      UPDATE users
      SET username = $1, role = $2, loja_id = $3
      WHERE id = $4
      RETURNING id, username, role, loja_id
    `;
    const result = await pool.query(query, [username, role, loja_id, id]);
    return result.rows[0];
  }

  /**
   * Deleta usuário
   */
  static async deletar(id) {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING id, username';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Usuario;
