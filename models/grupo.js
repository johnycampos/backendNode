const { pool } = require('../db');

class Grupo {
  static async criar(grupo) {
    const { nome, descricao } = grupo;
    const query = `
      INSERT INTO grupos (nome, descricao)
      VALUES ($1, $2)
      RETURNING *
    `;
    const values = [nome, descricao];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar() {
    const query = 'SELECT * FROM grupos ORDER BY nome';
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = 'SELECT * FROM grupos WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async atualizar(id, grupo) {
    const { nome, descricao } = grupo;
    const query = `
      UPDATE grupos
      SET nome = $1, descricao = $2
      WHERE id = $3
      RETURNING *
    `;
    const values = [nome, descricao, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id) {
    const query = 'DELETE FROM grupos WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Grupo; 