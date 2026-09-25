const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de relatórios requerem autenticação
router.use(authMiddleware);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/relatorios/vendas
 * Filtros de query: ?loja_id=, ?data_inicio=, ?data_fim=, ?limit=500, ?offset=0
 * Tenant isolation:
 *  - super_admin pode filtrar por loja_id ou ver consolidado de todas as lojas
 *  - admin_loja e funcionario são estritamente restritos a req.lojaId
 * Paginação opcional:
 *  - limit: default 500, max 1000
 *  - offset: default 0
 */
router.get('/vendas', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let loja_id = null;

    if (!isSuperAdmin) {
      loja_id = req.lojaId;
    }

    if (req.query.loja_id !== undefined && req.query.loja_id !== '') {
      const parsedLojaId = parseInt(req.query.loja_id, 10);
      if (Number.isNaN(parsedLojaId) || parsedLojaId <= 0) {
        return res.status(400).json({ error: 'loja_id inválido' });
      }
      if (isSuperAdmin) {
        loja_id = parsedLojaId;
      }
    }

    const { data_inicio, data_fim } = req.query;

    if (data_inicio && (!DATE_REGEX.test(data_inicio) || isNaN(Date.parse(data_inicio)))) {
      return res.status(400).json({ error: 'Formato de data_inicio inválido. Use o formato YYYY-MM-DD' });
    }

    if (data_fim && (!DATE_REGEX.test(data_fim) || isNaN(Date.parse(data_fim)))) {
      return res.status(400).json({ error: 'Formato de data_fim inválido. Use o formato YYYY-MM-DD' });
    }

    // Paginação opcional (default limit=500, offset=0)
    let limit = 500;
    let offset = 0;

    if (req.query.limit !== undefined && req.query.limit !== '') {
      const parsedLimit = parseInt(req.query.limit, 10);
      if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: 'limit inválido' });
      }
      limit = Math.min(parsedLimit, 1000);
    }

    if (req.query.offset !== undefined && req.query.offset !== '') {
      const parsedOffset = parseInt(req.query.offset, 10);
      if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({ error: 'offset inválido' });
      }
      offset = parsedOffset;
    }

    // Cláusula WHERE base para filtros
    let whereClause = ' WHERE lj.ativo = true';
    const filterValues = [];
    let filterIndex = 1;

    if (loja_id) {
      whereClause += ` AND v.loja_id = $${filterIndex++}`;
      filterValues.push(loja_id);
    }

    if (data_inicio) {
      whereClause += ` AND v.data_venda >= $${filterIndex++}::timestamp`;
      filterValues.push(data_inicio);
    }

    if (data_fim) {
      whereClause += ` AND v.data_venda <= ($${filterIndex++}::date + INTERVAL '1 day')`;
      filterValues.push(data_fim);
    }

    // 1. Query para Totais Agregados
    const totaisQuery = `
      SELECT 
        COUNT(DISTINCT v.id)::int AS quantidade_vendas,
        COALESCE(SUM(v.valor_total), 0)::float AS valor_total,
        COALESCE(SUM(iv.quantidade), 0)::float AS itens_vendidos_total
      FROM vendas v
      LEFT JOIN itens_venda iv ON v.id = iv.venda_id
      LEFT JOIN lojas lj ON v.loja_id = lj.id
      ${whereClause}
    `;

    const { rows: totaisRows } = await pool.query(totaisQuery, filterValues);
    const totalRow = totaisRows[0] || { quantidade_vendas: 0, valor_total: 0, itens_vendidos_total: 0 };
    const quantidadeVendas = totalRow.quantidade_vendas || 0;
    const valorTotal = parseFloat(totalRow.valor_total || 0);
    const itensVendidosTotal = parseFloat(totalRow.itens_vendidos_total || 0);
    const ticketMedio = quantidadeVendas > 0 ? parseFloat((valorTotal / quantidadeVendas).toFixed(2)) : 0;

    // 2. Query breakdown por loja (se super_admin sem filtro específico de loja)
    let porLoja = [];
    if (isSuperAdmin && !loja_id) {
      const porLojaQuery = `
        SELECT 
          v.loja_id,
          lj.nome AS loja_nome,
          COUNT(DISTINCT v.id)::int AS quantidade_vendas,
          COALESCE(SUM(v.valor_total), 0)::float AS valor_total,
          COALESCE(SUM(iv.quantidade), 0)::float AS itens_vendidos
        FROM vendas v
        LEFT JOIN itens_venda iv ON v.id = iv.venda_id
        LEFT JOIN lojas lj ON v.loja_id = lj.id
        ${whereClause}
        GROUP BY v.loja_id, lj.nome
        ORDER BY lj.nome ASC
      `;
      const { rows: porLojaRows } = await pool.query(porLojaQuery, filterValues);
      porLoja = porLojaRows.map(l => ({
        loja_id: l.loja_id,
        loja_nome: l.loja_nome || `Loja #${l.loja_id}`,
        quantidade_vendas: l.quantidade_vendas,
        valor_total: parseFloat(l.valor_total.toFixed(2)),
        itens_vendidos: l.itens_vendidos,
        ticket_medio: l.quantidade_vendas > 0 ? parseFloat((l.valor_total / l.quantidade_vendas).toFixed(2)) : 0
      }));
    }

    // 3. Query da lista de vendas paginada
    let listQuery = `
      SELECT v.id,
             v.data_venda,
             v.valor_total,
             v.forma_pagamento,
             v.parcelas,
             v.observacoes,
             v.loja_id,
             lj.nome AS loja_nome,
             v.vendedor_id,
             u.username AS vendedor_nome,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', iv.id,
                   'item_id', iv.item_id,
                   'item_nome', i.nome,
                   'item_codigo', i.codigo,
                   'quantidade', iv.quantidade,
                   'preco_unitario', iv.preco_unitario,
                   'valor_total_item', iv.valor_total_item
                 )
               ) FILTER (WHERE iv.id IS NOT NULL),
               '[]'::json
             ) AS itens
      FROM vendas v
      LEFT JOIN itens_venda iv ON v.id = iv.venda_id
      LEFT JOIN itens i ON iv.item_id = i.id
      LEFT JOIN lojas lj ON v.loja_id = lj.id
      LEFT JOIN users u ON v.vendedor_id = u.id
      ${whereClause}
      GROUP BY v.id, lj.nome, u.username
      ORDER BY v.data_venda DESC
      LIMIT $${filterIndex++} OFFSET $${filterIndex++}
    `;

    const listValues = [...filterValues, limit, offset];
    const { rows: vendas } = await pool.query(listQuery, listValues);

    res.json({
      vendas,
      totais: {
        quantidade_vendas: quantidadeVendas,
        valor_total: parseFloat(valorTotal.toFixed(2)),
        ticket_medio: ticketMedio,
        itens_vendidos_total: itensVendidosTotal
      },
      por_loja: porLoja,
      paginacao: {
        total: quantidadeVendas,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de vendas:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de vendas' });
  }
});

/**
 * GET /api/relatorios/estoque
 * Filtros de query: ?loja_id=, ?limit=500, ?offset=0
 * Tenant isolation:
 *  - super_admin pode filtrar por loja_id ou ver consolidado de todas as lojas
 *  - admin_loja e funcionario são estritamente restritos a req.lojaId
 * Paginação opcional:
 *  - limit: default 500, max 1000
 *  - offset: default 0
 */
router.get('/estoque', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let loja_id = null;

    if (!isSuperAdmin) {
      loja_id = req.lojaId;
    }

    if (req.query.loja_id !== undefined && req.query.loja_id !== '') {
      const parsedLojaId = parseInt(req.query.loja_id, 10);
      if (Number.isNaN(parsedLojaId) || parsedLojaId <= 0) {
        return res.status(400).json({ error: 'loja_id inválido' });
      }
      if (isSuperAdmin) {
        loja_id = parsedLojaId;
      }
    }

    // Paginação opcional (default limit=500, offset=0)
    let limit = 500;
    let offset = 0;

    if (req.query.limit !== undefined && req.query.limit !== '') {
      const parsedLimit = parseInt(req.query.limit, 10);
      if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: 'limit inválido' });
      }
      limit = Math.min(parsedLimit, 1000);
    }

    if (req.query.offset !== undefined && req.query.offset !== '') {
      const parsedOffset = parseInt(req.query.offset, 10);
      if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({ error: 'offset inválido' });
      }
      offset = parsedOffset;
    }

    // Cláusula WHERE base para filtros
    let whereClause = ' WHERE lj.ativo = true';
    const filterValues = [];
    let filterIndex = 1;

    if (loja_id) {
      whereClause += ` AND i.loja_id = $${filterIndex++}`;
      filterValues.push(loja_id);
    }

    // 1. Query para Totais Agregados
    const totaisQuery = `
      SELECT 
        COUNT(i.id)::int AS total_itens,
        COALESCE(SUM(i.quantidade_disponivel), 0)::float AS total_unidades,
        COALESCE(SUM(i.custo_compra * i.quantidade_disponivel), 0)::float AS valor_custo_total,
        COUNT(CASE WHEN i.quantidade_disponivel <= i.quantidade_minima THEN 1 END)::int AS total_itens_abaixo_minimo
      FROM itens i
      INNER JOIN lojas lj ON i.loja_id = lj.id
      ${whereClause}
    `;

    const { rows: totaisRows } = await pool.query(totaisQuery, filterValues);
    const totalRow = totaisRows[0] || { total_itens: 0, total_unidades: 0, valor_custo_total: 0, total_itens_abaixo_minimo: 0 };
    const totalItens = totalRow.total_itens || 0;
    const totalUnidades = parseFloat(totalRow.total_unidades || 0);
    const valorCustoTotal = parseFloat(totalRow.valor_custo_total || 0);
    const totalItensAbaixoMinimo = totalRow.total_itens_abaixo_minimo || 0;

    // 2. Query breakdown por loja (se super_admin sem filtro específico de loja)
    let porLoja = [];
    if (isSuperAdmin && !loja_id) {
      const porLojaQuery = `
        SELECT 
          i.loja_id,
          lj.nome AS loja_nome,
          COUNT(i.id)::int AS total_itens,
          COALESCE(SUM(i.quantidade_disponivel), 0)::float AS total_unidades,
          COALESCE(SUM(i.custo_compra * i.quantidade_disponivel), 0)::float AS valor_custo_total,
          COUNT(CASE WHEN i.quantidade_disponivel <= i.quantidade_minima THEN 1 END)::int AS total_itens_abaixo_minimo
        FROM itens i
        INNER JOIN lojas lj ON i.loja_id = lj.id
        ${whereClause}
        GROUP BY i.loja_id, lj.nome
        ORDER BY lj.nome ASC
      `;
      const { rows: porLojaRows } = await pool.query(porLojaQuery, filterValues);
      porLoja = porLojaRows.map(l => ({
        loja_id: l.loja_id,
        loja_nome: l.loja_nome || `Loja #${l.loja_id}`,
        total_itens: l.total_itens,
        total_unidades: l.total_unidades,
        valor_custo_total: parseFloat(l.valor_custo_total.toFixed(2)),
        total_itens_abaixo_minimo: l.total_itens_abaixo_minimo
      }));
    }

    // 3. Query da lista de itens paginada
    let listQuery = `
      SELECT i.id,
             i.codigo,
             i.nome,
             i.nome_curto,
             i.custo_compra,
             i.percentual_lucro,
             i.valor,
             i.preco_consumidor,
             i.preco_revenda,
             i.preco_outros,
             i.quantidade_disponivel,
             i.lote_ideal,
             i.quantidade_minima,
             i.gaveta,
             i.observacoes,
             i.loja_id,
             lj.nome AS loja_nome,
             g.nome AS grupo_nome,
             s.nome AS subgrupo_nome,
             u.nome AS unidade_nome,
             f.nome AS fabricante_nome,
             le.nome AS local_estoque_nome
      FROM itens i
      INNER JOIN lojas lj ON i.loja_id = lj.id
      LEFT JOIN grupos g ON i.grupo_id = g.id
      LEFT JOIN subgrupos s ON i.subgrupo_id = s.id
      LEFT JOIN unidades u ON i.unidade_id = u.id
      LEFT JOIN fabricantes f ON i.fabricante_id = f.id
      LEFT JOIN locais_estoque le ON i.local_estoque_id = le.id
      ${whereClause}
      ORDER BY lj.nome ASC, i.nome ASC
      LIMIT $${filterIndex++} OFFSET $${filterIndex++}
    `;

    const listValues = [...filterValues, limit, offset];
    const { rows } = await pool.query(listQuery, listValues);

    const itens = rows.map(item => {
      const custoCompra = parseFloat(item.custo_compra || 0);
      const qtdDisponivel = parseFloat(item.quantidade_disponivel || 0);
      const qtdMinima = parseFloat(item.quantidade_minima || 0);
      const valorCustoItem = parseFloat((custoCompra * qtdDisponivel).toFixed(2));
      const abaixoDoMinimo = qtdDisponivel <= qtdMinima;

      return {
        ...item,
        custo_compra: custoCompra,
        quantidade_disponivel: qtdDisponivel,
        quantidade_minima: qtdMinima,
        valor_custo_total: valorCustoItem,
        abaixo_do_minimo: abaixoDoMinimo
      };
    });

    res.json({
      itens,
      totais: {
        total_itens: totalItens,
        total_unidades: totalUnidades,
        valor_custo_total: parseFloat(valorCustoTotal.toFixed(2)),
        total_itens_abaixo_minimo: totalItensAbaixoMinimo
      },
      por_loja: porLoja,
      paginacao: {
        total: totalItens,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de estoque:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de estoque' });
  }
});

module.exports = router;
