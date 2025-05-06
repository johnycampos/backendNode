const { pool } = require('../db');

class Subgrupo {
  static async criar(subgrupo) {
    const { nome, descricao, grupo_id } = subgrupo;
    const query = `
      INSERT INTO subgrupos (nome, descricao, grupo_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [nome, descricao, grupo_id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar() {
    const query = `
      SELECT s.*, g.nome as grupo_nome 
      FROM subgrupos s
      JOIN grupos g ON s.grupo_id = g.id
      ORDER BY s.nome
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async buscarPorId(id) {
    const query = `
      SELECT s.*, g.nome as grupo_nome 
      FROM subgrupos s
      JOIN grupos g ON s.grupo_id = g.id
      WHERE s.grupo_id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async atualizar(id, subgrupo) {
    const { nome, descricao, grupo_id } = subgrupo;
    const query = `
      UPDATE subgrupos
      SET nome = $1, descricao = $2, grupo_id = $3
      WHERE id = $4
      RETURNING *
    `;
    const values = [nome, descricao, grupo_id, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id) {
    const query = 'DELETE FROM subgrupos WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async listarPorGrupo(grupo_id) {
    const query = `
      SELECT * FROM subgrupos 
      WHERE grupo_id = $1
      ORDER BY nome
    `;
    const result = await pool.query(query, [grupo_id]);
    return result.rows;
  }
}

module.exports = Subgrupo; 