const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de relatórios requerem autenticação
router.use(authMiddleware);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/relatorios/vendas
 * Filtros de query: ?loja_id=, ?data_inicio=, ?data_fim=
 * Tenant isolation:
 *  - super_admin pode filtrar por loja_id ou ver consolidado de todas as lojas
 *  - admin_loja e funcionario são estritamente restritos a req.lojaId
 */
router.get('/vendas', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let loja_id = null;

    if (!isSuperAdmin) {
      loja_id = req.lojaId;
    } else if (req.query.loja_id) {
      loja_id = parseInt(req.query.loja_id, 10);
    }

    const { data_inicio, data_fim } = req.query;

    if (data_inicio && (!DATE_REGEX.test(data_inicio) || isNaN(Date.parse(data_inicio)))) {
      return res.status(400).json({ error: 'Formato de data_inicio inválido. Use o formato YYYY-MM-DD' });
    }

    if (data_fim && (!DATE_REGEX.test(data_fim) || isNaN(Date.parse(data_fim)))) {
      return res.status(400).json({ error: 'Formato de data_fim inválido. Use o formato YYYY-MM-DD' });
    }

    let query = `
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
      WHERE lj.ativo = true
    `;

    const values = [];
    let paramIndex = 1;

    if (loja_id) {
      query += ` AND v.loja_id = $${paramIndex++}`;
      values.push(loja_id);
    }

    if (data_inicio) {
      query += ` AND v.data_venda >= $${paramIndex++}::timestamp`;
      values.push(data_inicio);
    }

    if (data_fim) {
      query += ` AND v.data_venda <= ($${paramIndex++}::date + INTERVAL '1 day')`;
      values.push(data_fim);
    }

    query += `
      GROUP BY v.id, lj.nome, u.username
      ORDER BY v.data_venda DESC
    `;

    const { rows: vendas } = await pool.query(query, values);

    // Calcular agregados / totais
    let valorTotal = 0;
    let itensVendidosTotal = 0;
    const porLojaMap = {};

    vendas.forEach(v => {
      const vTotal = parseFloat(v.valor_total || 0);
      valorTotal += vTotal;

      let qtdItensNaVenda = 0;
      if (Array.isArray(v.itens)) {
        v.itens.forEach(it => {
          const qtd = parseFloat(it.quantidade || 0);
          itensVendidosTotal += qtd;
          qtdItensNaVenda += qtd;
        });
      }

      // Agrupamento por loja se super_admin
      if (isSuperAdmin && !loja_id) {
        if (!porLojaMap[v.loja_id]) {
          porLojaMap[v.loja_id] = {
            loja_id: v.loja_id,
            loja_nome: v.loja_nome || `Loja #${v.loja_id}`,
            quantidade_vendas: 0,
            valor_total: 0,
            itens_vendidos: 0,
            ticket_medio: 0
          };
        }
        porLojaMap[v.loja_id].quantidade_vendas += 1;
        porLojaMap[v.loja_id].valor_total += vTotal;
        porLojaMap[v.loja_id].itens_vendidos += qtdItensNaVenda;
      }
    });

    const quantidadeVendas = vendas.length;
    const ticketMedio = quantidadeVendas > 0 ? parseFloat((valorTotal / quantidadeVendas).toFixed(2)) : 0;

    let porLoja = [];
    if (isSuperAdmin && !loja_id) {
      porLoja = Object.values(porLojaMap).map(l => ({
        ...l,
        valor_total: parseFloat(l.valor_total.toFixed(2)),
        ticket_medio: l.quantidade_vendas > 0 ? parseFloat((l.valor_total / l.quantidade_vendas).toFixed(2)) : 0
      }));
    }

    res.json({
      vendas,
      totais: {
        quantidade_vendas: quantidadeVendas,
        valor_total: parseFloat(valorTotal.toFixed(2)),
        ticket_medio: ticketMedio,
        itens_vendidos_total: itensVendidosTotal
      },
      por_loja: porLoja
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de vendas:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de vendas' });
  }
});

/**
 * GET /api/relatorios/estoque
 * Filtros de query: ?loja_id=
 * Tenant isolation:
 *  - super_admin pode filtrar por loja_id ou ver consolidado de todas as lojas
 *  - admin_loja e funcionario são estritamente restritos a req.lojaId
 */
router.get('/estoque', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let loja_id = null;

    if (!isSuperAdmin) {
      loja_id = req.lojaId;
    } else if (req.query.loja_id) {
      loja_id = parseInt(req.query.loja_id, 10);
    }

    let query = `
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
      WHERE lj.ativo = true
    `;

    const values = [];
    if (loja_id) {
      query += ` AND i.loja_id = $1`;
      values.push(loja_id);
    }

    query += ` ORDER BY lj.nome ASC, i.nome ASC`;

    const { rows } = await pool.query(query, values);

    let totalItens = rows.length;
    let totalUnidades = 0;
    let valorCustoTotal = 0;
    let totalItensAbaixoMinimo = 0;
    const porLojaMap = {};

    const itens = rows.map(item => {
      const custoCompra = parseFloat(item.custo_compra || 0);
      const qtdDisponivel = parseFloat(item.quantidade_disponivel || 0);
      const qtdMinima = parseFloat(item.quantidade_minima || 0);
      const valorCustoItem = parseFloat((custoCompra * qtdDisponivel).toFixed(2));
      const abaixoDoMinimo = qtdDisponivel <= qtdMinima;

      totalUnidades += qtdDisponivel;
      valorCustoTotal += valorCustoItem;
      if (abaixoDoMinimo) {
        totalItensAbaixoMinimo += 1;
      }

      if (isSuperAdmin && !loja_id) {
        if (!porLojaMap[item.loja_id]) {
          porLojaMap[item.loja_id] = {
            loja_id: item.loja_id,
            loja_nome: item.loja_nome || `Loja #${item.loja_id}`,
            total_itens: 0,
            total_unidades: 0,
            valor_custo_total: 0,
            total_itens_abaixo_minimo: 0
          };
        }
        porLojaMap[item.loja_id].total_itens += 1;
        porLojaMap[item.loja_id].total_unidades += qtdDisponivel;
        porLojaMap[item.loja_id].valor_custo_total += valorCustoItem;
        if (abaixoDoMinimo) {
          porLojaMap[item.loja_id].total_itens_abaixo_minimo += 1;
        }
      }

      return {
        ...item,
        custo_compra: custoCompra,
        quantidade_disponivel: qtdDisponivel,
        quantidade_minima: qtdMinima,
        valor_custo_total: valorCustoItem,
        abaixo_do_minimo: abaixoDoMinimo
      };
    });

    let porLoja = [];
    if (isSuperAdmin && !loja_id) {
      porLoja = Object.values(porLojaMap).map(l => ({
        ...l,
        valor_custo_total: parseFloat(l.valor_custo_total.toFixed(2))
      }));
    }

    res.json({
      itens,
      totais: {
        total_itens: totalItens,
        total_unidades: totalUnidades,
        valor_custo_total: parseFloat(valorCustoTotal.toFixed(2)),
        total_itens_abaixo_minimo: totalItensAbaixoMinimo
      },
      por_loja: porLoja
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de estoque:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de estoque' });
  }
});

module.exports = router;
