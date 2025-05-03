const { pool } = require('../db');

class Unidade {
  static async criar(unidade) {
    const { nome, sigla, descricao } = unidade;
    const query = `
      INSERT INTO unidades (nome, sigla, descricao)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [nome, sigla, descricao];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar() {
    const query = 'SELECT * FROM unidades ORDER BY nome';
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = 'SELECT * FROM unidades WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async atualizar(id, unidade) {
    const { nome, sigla, descricao } = unidade;
    const query = `
      UPDATE unidades
      SET nome = $1, sigla = $2, descricao = $3
      WHERE id = $4
      RETURNING *
    `;
    const values = [nome, sigla, descricao, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id) {
    const query = 'DELETE FROM unidades WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Unidade; 