const { pool } = require('../db');

class Fabricante {
  static async criar(fabricante) {
    const { nome, cnpj, contato, telefone, email, observacoes } = fabricante;
    const query = `
      INSERT INTO fabricantes (nome, cnpj, contato, telefone, email, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [nome, cnpj, contato, telefone, email, observacoes];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar() {
    const query = 'SELECT * FROM fabricantes ORDER BY nome';
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = 'SELECT * FROM fabricantes WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async atualizar(id, fabricante) {
    const { nome, cnpj, contato, telefone, email, observacoes } = fabricante;
    const query = `
      UPDATE fabricantes
      SET nome = $1, cnpj = $2, contato = $3, telefone = $4, email = $5, observacoes = $6
      WHERE id = $7
      RETURNING *
    `;
    const values = [nome, cnpj, contato, telefone, email, observacoes, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id) {
    const query = 'DELETE FROM fabricantes WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Fabricante; 