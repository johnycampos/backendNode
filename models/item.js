const { pool } = require('../db');

class Item {
  static async criar(item) {
    const {
      codigo,
      nome,
      nome_curto,
      grupo_id,
      subgrupo_id,
      custo_compra,
      percentual_lucro,
      valor,
      preco_consumidor,
      preco_revenda,
      preco_outros,
      quantidade_disponivel,
      lote_ideal,
      quantidade_minima,
      unidade_id,
      fabricante_id,
      local_estoque_id,
      gaveta,
      observacoes,
      loja_id
    } = item;

    const query = `
      INSERT INTO itens (
        codigo, nome, nome_curto, grupo_id, subgrupo_id, custo_compra,
        percentual_lucro, valor, preco_consumidor, preco_revenda, preco_outros,
        quantidade_disponivel, lote_ideal, quantidade_minima, unidade_id,
        fabricante_id, local_estoque_id, gaveta, observacoes, loja_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const values = [
      codigo,
      nome,
      nome_curto,
      grupo_id,
      subgrupo_id,
      custo_compra,
      percentual_lucro,
      valor,
      preco_consumidor,
      preco_revenda,
      preco_outros,
      quantidade_disponivel || 0,
      lote_ideal,
      quantidade_minima,
      unidade_id,
      fabricante_id,
      local_estoque_id,
      gaveta,
      observacoes,
      loja_id
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar(loja_id = null) {
    let query = `
      SELECT i.*, 
             g.nome as grupo_nome,
             s.nome as subgrupo_nome,
             u.nome as unidade_nome,
             f.nome as fabricante_nome,
             le.nome as local_estoque_nome,
             lj.nome as loja_nome
      FROM itens i
      LEFT JOIN grupos g ON i.grupo_id = g.id
      LEFT JOIN subgrupos s ON i.subgrupo_id = s.id
      LEFT JOIN unidades u ON i.unidade_id = u.id
      LEFT JOIN fabricantes f ON i.fabricante_id = f.id
      LEFT JOIN locais_estoque le ON i.local_estoque_id = le.id
      LEFT JOIN lojas lj ON i.loja_id = lj.id
    `;
    const values = [];

    if (loja_id) {
      query += ` WHERE i.loja_id = $1`;
      values.push(loja_id);
    }

    query += ` ORDER BY i.nome ASC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async buscarPorId(id, loja_id = null) {
    let query = `
      SELECT i.*, 
             g.nome as grupo_nome,
             s.nome as subgrupo_nome,
             u.nome as unidade_nome,
             f.nome as fabricante_nome,
             le.nome as local_estoque_nome,
             lj.nome as loja_nome
      FROM itens i
      LEFT JOIN grupos g ON i.grupo_id = g.id
      LEFT JOIN subgrupos s ON i.subgrupo_id = s.id
      LEFT JOIN unidades u ON i.unidade_id = u.id
      LEFT JOIN fabricantes f ON i.fabricante_id = f.id
      LEFT JOIN locais_estoque le ON i.local_estoque_id = le.id
      LEFT JOIN lojas lj ON i.loja_id = lj.id
      WHERE i.id = $1
    `;
    const values = [id];

    if (loja_id) {
      query += ` AND i.loja_id = $2`;
      values.push(loja_id);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async buscarPorCodigo(codigo, loja_id = null) {
    let query = 'SELECT * FROM itens WHERE codigo = $1';
    const values = [codigo];

    if (loja_id) {
      query += ' AND loja_id = $2';
      values.push(loja_id);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async atualizar(id, item, loja_id = null) {
    const {
      codigo,
      nome,
      nome_curto,
      grupo_id,
      subgrupo_id,
      custo_compra,
      percentual_lucro,
      valor,
      preco_consumidor,
      preco_revenda,
      preco_outros,
      quantidade_disponivel,
      lote_ideal,
      quantidade_minima,
      unidade_id,
      fabricante_id,
      local_estoque_id,
      gaveta,
      observacoes
    } = item;

    let query = `
      UPDATE itens
      SET codigo = $1,
          nome = $2,
          nome_curto = $3,
          grupo_id = $4,
          subgrupo_id = $5,
          custo_compra = $6,
          percentual_lucro = $7,
          valor = $8,
          preco_consumidor = $9,
          preco_revenda = $10,
          preco_outros = $11,
          quantidade_disponivel = $12,
          lote_ideal = $13,
          quantidade_minima = $14,
          unidade_id = $15,
          fabricante_id = $16,
          local_estoque_id = $17,
          gaveta = $18,
          observacoes = $19,
          ultima_atualizacao = CURRENT_TIMESTAMP
      WHERE id = $20
    `;

    const values = [
      codigo,
      nome,
      nome_curto,
      grupo_id,
      subgrupo_id,
      custo_compra,
      percentual_lucro,
      valor,
      preco_consumidor,
      preco_revenda,
      preco_outros,
      quantidade_disponivel,
      lote_ideal,
      quantidade_minima,
      unidade_id,
      fabricante_id,
      local_estoque_id,
      gaveta,
      observacoes,
      id
    ];

    if (loja_id) {
      query += ` AND loja_id = $21`;
      values.push(loja_id);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletar(id, loja_id = null) {
    let query = 'DELETE FROM itens WHERE id = $1';
    const values = [id];

    if (loja_id) {
      query += ' AND loja_id = $2';
      values.push(loja_id);
    }

    query += ' RETURNING *';
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async atualizarEstoque(id, quantidade, loja_id = null) {
    let query = `
      UPDATE itens
      SET quantidade_disponivel = quantidade_disponivel + $1,
          ultima_atualizacao = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    const values = [quantidade, id];

    if (loja_id) {
      query += ' AND loja_id = $3';
      values.push(loja_id);
    }

    query += ' RETURNING *';
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = Item;