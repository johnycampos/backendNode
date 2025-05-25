const { pool } = require('../db');

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

        // Atualizar o estoque do item
        const atualizarEstoqueQuery = `
          UPDATE itens
          SET quantidade_disponivel = quantidade_disponivel - $1
          WHERE id = $2
        `;
        await client.query(atualizarEstoqueQuery, [item.quantidade, item.item_id]);
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

  static async buscarPorId(id) {
    const query = `
      SELECT v.*, 
             json_agg(json_build_object(
               'id', iv.id,
               'item_id', iv.item_id,
               'quantidade', iv.quantidade,
               'preco_unitario', iv.preco_unitario,
               'valor_total_item', iv.valor_total_item
             )) as itens
      FROM vendas v
      LEFT JOIN itens_venda iv ON v.id = iv.venda_id
      WHERE v.id = $1
      GROUP BY v.id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async listar() {
    const query = `
      SELECT v.*, 
             json_agg(json_build_object(
               'id', iv.id,
               'item_id', iv.item_id,
               'quantidade', iv.quantidade,
               'preco_unitario', iv.preco_unitario,
               'valor_total_item', iv.valor_total_item
             )) as itens
      FROM vendas v
      LEFT JOIN itens_venda iv ON v.id = iv.venda_id
      GROUP BY v.id
      ORDER BY v.data_venda DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = Venda; 