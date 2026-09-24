const { pool } = require('../db');
const Item = require('./item');

class Venda {
  static async criar(vendaData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Inserir a venda
      const vendaQuery = `
        INSERT INTO vendas (
          valor_total,
          forma_pagamento,
          parcelas,
          observacoes,
          loja_id,
          vendedor_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const vendaValues = [
        vendaData.valor_total,
        vendaData.forma_pagamento,
        vendaData.parcelas,
        vendaData.observacoes,
        vendaData.loja_id,
        vendaData.vendedor_id
      ];

      const vendaResult = await client.query(vendaQuery, vendaValues);
      const venda = vendaResult.rows[0];

      // Inserir os itens da venda
      for (const item of vendaData.itens) {
        // Calcular o valor total do item
        const valorTotalItem = item.quantidade * item.preco_unitario;

        const itemVendaQuery = `
          INSERT INTO itens_venda (
            venda_id,
            item_id,
            quantidade,
            preco_unitario,
            valor_total_item
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;

        const itemVendaValues = [
          venda.id,
          item.item_id,
          item.quantidade,
          item.preco_unitario,
          valorTotalItem
        ];

        await client.query(itemVendaQuery, itemVendaValues);

        // Atualizar o estoque usando o método do modelo Item (respeitando a loja se fornecida)
        await Item.atualizarEstoque(item.item_id, -item.quantidade, vendaData.loja_id);
      }

      await client.query('COMMIT');
      return venda;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async buscarPorId(id, loja_id = null) {
    let query = `
      SELECT v.*, 
             lj.nome as loja_nome,
             u.username as vendedor_nome,
             json_agg(json_build_object(
               'id', iv.id,
               'item_id', iv.item_id,
               'quantidade', iv.quantidade,
               'preco_unitario', iv.preco_unitario,
               'valor_total_item', iv.valor_total_item
             )) as itens
      FROM vendas v
      LEFT JOIN itens_venda iv ON v.id = iv.venda_id
      LEFT JOIN lojas lj ON v.loja_id = lj.id
      LEFT JOIN users u ON v.vendedor_id = u.id
      WHERE v.id = $1
    `;
    const values = [id];

    if (loja_id) {
      query += ` AND v.loja_id = $2`;
      values.push(loja_id);
    }

    query += `
      GROUP BY v.id, lj.nome, u.username
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async listar(loja_id = null) {
    let query = `
      SELECT v.*, 
             lj.nome as loja_nome,
             u.username as vendedor_nome,
             json_agg(json_build_object(
               'id', iv.id,
               'item_id', iv.item_id,
               'quantidade', iv.quantidade,
               'preco_unitario', iv.preco_unitario,
               'valor_total_item', iv.valor_total_item
             )) as itens
      FROM vendas v
      LEFT JOIN itens_venda iv ON v.id = iv.venda_id
      LEFT JOIN lojas lj ON v.loja_id = lj.id
      LEFT JOIN users u ON v.vendedor_id = u.id
    `;
    const values = [];

    if (loja_id) {
      query += ` WHERE v.loja_id = $1`;
      values.push(loja_id);
    }

    query += `
      GROUP BY v.id, lj.nome, u.username
      ORDER BY v.data_venda DESC
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = Venda;