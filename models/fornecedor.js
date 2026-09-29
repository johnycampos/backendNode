const { pool } = require('../db');

class Fornecedor {
  static async criar(fornecedor) {
    const { codigo, nome, cnpj, fone, cidade, uf } = fornecedor;
    const query = `
      INSERT INTO fornecedores (codigo, nome, cnpj, fone, cidade, uf)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [codigo, nome, cnpj, fone, cidade, uf];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar() {
    const query = 'SELECT * FROM fornecedores ORDER BY nome';
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = 'SELECT * FROM fornecedores WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async atualizar(id, fornecedor) {
    const { codigo, nome, cnpj, fone, cidade, uf } = fornecedor;
    const query = `
      UPDATE fornecedores
      SET codigo = $1, nome = $2, cnpj = $3, fone = $4, cidade = $5, uf = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;
    const values = [codigo, nome, cnpj, fone, cidade, uf, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id) {
    const query = 'DELETE FROM fornecedores WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Fornecedor;
