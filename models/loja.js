const { pool } = require('../db');

class Loja {
  static async listar() {
    const query = 'SELECT * FROM lojas WHERE ativo = true ORDER BY is_matriz DESC, nome ASC';
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = 'SELECT * FROM lojas WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async buscarMatriz() {
    const query = 'SELECT * FROM lojas WHERE is_matriz = true LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0];
  }
}

module.exports = Loja;
