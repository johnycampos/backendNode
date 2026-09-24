const { pool } = require('../db');

class LocalEstoque {
  static async criar(local) {
    const { nome, descricao, endereco, loja_id } = local;
    const query = `
      INSERT INTO locais_estoque (nome, descricao, endereco, loja_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [nome, descricao, endereco, loja_id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar(loja_id = null) {
    let query = `
      SELECT le.*, l.nome as loja_nome
      FROM locais_estoque le
      LEFT JOIN lojas l ON le.loja_id = l.id
    `;
    const values = [];

    if (loja_id) {
      query += ' WHERE le.loja_id = $1';
      values.push(loja_id);
    }

    query += ' ORDER BY le.nome ASC';
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async buscarPorId(id, loja_id = null) {
    let query = `
      SELECT le.*, l.nome as loja_nome
      FROM locais_estoque le
      LEFT JOIN lojas l ON le.loja_id = l.id
      WHERE le.id = $1
    `;
    const values = [id];

    if (loja_id) {
      query += ' AND le.loja_id = $2';
      values.push(loja_id);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async atualizar(id, local, loja_id = null) {
    const { nome, descricao, endereco } = local;
    let query = `
      UPDATE locais_estoque
      SET nome = $1, descricao = $2, endereco = $3
      WHERE id = $4
    `;
    const values = [nome, descricao, endereco, id];

    if (loja_id) {
      query += ' AND loja_id = $5';
      values.push(loja_id);
    }

    query += ' RETURNING *';
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id, loja_id = null) {
    let query = 'DELETE FROM locais_estoque WHERE id = $1';
    const values = [id];

    if (loja_id) {
      query += ' AND loja_id = $2';
      values.push(loja_id);
    }

    query += ' RETURNING *';
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = LocalEstoque;