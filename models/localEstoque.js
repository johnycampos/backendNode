const { pool } = require('../db');

class LocalEstoque {
  static async criar(local) {
    const { nome, descricao, endereco } = local;
    const query = `
      INSERT INTO locais_estoque (nome, descricao, endereco)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [nome, descricao, endereco];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar() {
    const query = 'SELECT * FROM locais_estoque ORDER BY nome';
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = 'SELECT * FROM locais_estoque WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async atualizar(id, local) {
    const { nome, descricao, endereco } = local;
    const query = `
      UPDATE locais_estoque
      SET nome = $1, descricao = $2, endereco = $3
      WHERE id = $4
      RETURNING *
    `;
    const values = [nome, descricao, endereco, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id) {
    const query = 'DELETE FROM locais_estoque WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = LocalEstoque; 