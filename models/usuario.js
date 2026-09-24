const { pool } = require('../db');

class Usuario {
  /**
   * Cria um novo usuário vinculado a uma loja
   */
  static async criar({ username, password, role, loja_id, ativo = true }) {
    const query = `
      INSERT INTO users (username, password, role, loja_id, ativo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, role, loja_id, ativo
    `;
    const values = [username, password, role, loja_id, ativo];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Busca usuário por username (incluindo senha e status para autenticação)
   */
  static async buscarPorUsername(username) {
    const query = `
      SELECT u.id, u.username, u.password, u.role, u.loja_id, u.ativo, l.nome as loja_nome, l.is_matriz
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
      SELECT u.id, u.username, u.role, u.loja_id, u.ativo, l.nome as loja_nome, l.is_matriz
      FROM users u
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE u.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Lista todos os usuários do sistema (visão global para super_admin)
   */
  static async listarTodos() {
    const query = `
      SELECT u.id, u.username, u.role, u.loja_id, u.ativo, l.nome as loja_nome, l.is_matriz
      FROM users u
      LEFT JOIN lojas l ON u.loja_id = l.id
      ORDER BY l.nome ASC, u.username ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Lista usuários. Se loja_id for informado, filtra pela loja;
   * se null (ex.: super_admin), retorna de todas as lojas.
   */
  static async listarPorLoja(loja_id = null) {
    let query = `
      SELECT u.id, u.username, u.role, u.loja_id, u.ativo, l.nome as loja_nome, l.is_matriz
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
   * Atualiza dados de um usuário (incluindo status ativo e opcionalmente senha)
   */
  static async atualizar(id, dados) {
    const campos = [];
    const values = [];
    let idx = 1;

    if (dados.username !== undefined) {
      campos.push(`username = $${idx++}`);
      values.push(dados.username);
    }

    if (dados.role !== undefined) {
      campos.push(`role = $${idx++}`);
      values.push(dados.role);
    }

    if (dados.loja_id !== undefined) {
      campos.push(`loja_id = $${idx++}`);
      values.push(dados.loja_id);
    }

    if (dados.ativo !== undefined) {
      campos.push(`ativo = $${idx++}`);
      values.push(dados.ativo);
    }

    if (dados.password !== undefined && dados.password !== '') {
      campos.push(`password = $${idx++}`);
      values.push(dados.password);
    }

    if (campos.length === 0) {
      return await Usuario.buscarPorId(id);
    }

    values.push(id);
    const query = `
      UPDATE users
      SET ${campos.join(', ')}
      WHERE id = $${idx}
      RETURNING id, username, role, loja_id, ativo
    `;

    const result = await pool.query(query, values);
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
