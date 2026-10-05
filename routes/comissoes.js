const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de comissões requerem autenticação
router.use(authMiddleware);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/comissoes/vendedores
 * Lista vendedores ativos para popular o filtro do relatório.
 * Respeita isolamento de tenant:
 *  - super_admin pode filtrar por loja_id ou ver de todas as lojas
 *  - admin_loja e funcionario são restritos a req.lojaId
 */
router.get('/vendedores', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let loja_id = !isSuperAdmin ? req.lojaId : null;

    if (req.query.loja_id !== undefined && req.query.loja_id !== '') {
      const parsedLojaId = parseInt(req.query.loja_id, 10);
      if (Number.isNaN(parsedLojaId) || parsedLojaId <= 0) {
        return res.status(400).json({ error: 'loja_id inválido' });
      }
      if (isSuperAdmin) {
        loja_id = parsedLojaId;
      }
    }

    let query = `
      SELECT u.id, u.username, u.loja_id, lj.nome AS loja_nome
      FROM users u
      LEFT JOIN lojas lj ON u.loja_id = lj.id
      WHERE u.ativo = true
    `;
    const params = [];
    if (loja_id) {
      query += ' AND u.loja_id = $1';
      params.push(loja_id);
    }
    query += ' ORDER BY u.username ASC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar vendedores para comissões:', err.message);
    res.status(500).json({ error: 'Erro no servidor ao listar vendedores' });
  }
});

/**
 * GET /api/comissoes/relatorio
 * Relatório de comissão de vendas por vendedor
 * 
 * Query params:
 *  - loja_id (opcional para super_admin, ignorado/forçado req.lojaId para admin_loja/funcionario)
 *  - vendedor_id (opcional, inteiro positivo)
 *  - data_inicio (opcional, YYYY-MM-DD)
 *  - data_fim (opcional, YYYY-MM-DD)
 *  - percentual (obrigatório, numérico > 0 e <= 100)
 */
router.get('/relatorio', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let loja_id = null;

    if (!isSuperAdmin) {
      loja_id = req.lojaId;
    }

    // 1. Validação de loja_id
    if (req.query.loja_id !== undefined && req.query.loja_id !== '') {
      const parsedLojaId = parseInt(req.query.loja_id, 10);
      if (Number.isNaN(parsedLojaId) || parsedLojaId <= 0) {
        return res.status(400).json({ error: 'loja_id inválido' });
      }
      if (isSuperAdmin) {
        loja_id = parsedLojaId;
      }
    }

    // 2. Validação de vendedor_id
    let vendedor_id = null;
    if (req.query.vendedor_id !== undefined && req.query.vendedor_id !== '') {
      const parsedVendedorId = parseInt(req.query.vendedor_id, 10);
      if (Number.isNaN(parsedVendedorId) || parsedVendedorId <= 0) {
        return res.status(400).json({ error: 'vendedor_id inválido' });
      }
      vendedor_id = parsedVendedorId;
    }

    // 3. Validação de percentual (obrigatório, > 0 e <= 100)
    const { percentual } = req.query;
    if (percentual === undefined || percentual === '') {
      return res.status(400).json({ error: 'O parâmetro percentual é obrigatório' });
    }

    const parsedPercentual = parseFloat(String(percentual).replace(',', '.'));
    if (Number.isNaN(parsedPercentual) || parsedPercentual <= 0 || parsedPercentual > 100) {
      return res.status(400).json({ error: 'Percentual inválido. Informe um valor numérico entre 0.01 e 100' });
    }

    // 4. Validação de datas
    const { data_inicio, data_fim } = req.query;

    if (data_inicio && (!DATE_REGEX.test(data_inicio) || isNaN(Date.parse(data_inicio)))) {
      return res.status(400).json({ error: 'Formato de data_inicio inválido. Use o formato YYYY-MM-DD' });
    }

    if (data_fim && (!DATE_REGEX.test(data_fim) || isNaN(Date.parse(data_fim)))) {
      return res.status(400).json({ error: 'Formato de data_fim inválido. Use o formato YYYY-MM-DD' });
    }

    // 5. Montagem da query com filtros dinâmicos
    let whereClause = ' WHERE lj.ativo = true';
    const filterValues = [];
    let filterIndex = 1;

    if (loja_id) {
      whereClause += ` AND v.loja_id = $${filterIndex++}`;
      filterValues.push(loja_id);
    }

    if (vendedor_id) {
      whereClause += ` AND v.vendedor_id = $${filterIndex++}`;
      filterValues.push(vendedor_id);
    }

    if (data_inicio) {
      whereClause += ` AND v.data_venda >= $${filterIndex++}::timestamp`;
      filterValues.push(data_inicio);
    }

    if (data_fim) {
      whereClause += ` AND v.data_venda <= ($${filterIndex++}::date + INTERVAL '1 day')`;
      filterValues.push(data_fim);
    }

    // Agrupamento por vendedor
    const query = `
      SELECT 
        v.vendedor_id,
        COALESCE(u.username, 'Não atribuído') AS vendedor_nome,
        v.loja_id,
        COALESCE(lj.nome, CONCAT('Loja #', v.loja_id)) AS loja_nome,
        COUNT(DISTINCT v.id)::int AS quantidade_vendas,
        COALESCE(SUM(v.valor_total), 0)::float AS valor_total_vendas
      FROM vendas v
      LEFT JOIN users u ON v.vendedor_id = u.id
      LEFT JOIN lojas lj ON v.loja_id = lj.id
      ${whereClause}
      GROUP BY v.vendedor_id, u.username, v.loja_id, lj.nome
      ORDER BY valor_total_vendas DESC, vendedor_nome ASC
    `;

    const { rows } = await pool.query(query, filterValues);

    // Cálculo da comissão realizado em JavaScript com precisão decimal (.toFixed(2))
    // para garantir consistência e flexibilidade no cálculo
    let totalQuantidadeVendas = 0;
    let totalValorVendas = 0;
    let totalComissao = 0;

    const vendedores = rows.map(r => {
      const qtdVendas = r.quantidade_vendas || 0;
      const valorTotal = parseFloat(Number(r.valor_total_vendas || 0).toFixed(2));
      const valorComissao = parseFloat((valorTotal * parsedPercentual / 100).toFixed(2));

      totalQuantidadeVendas += qtdVendas;
      totalValorVendas += valorTotal;
      totalComissao += valorComissao;

      return {
        vendedor_id: r.vendedor_id,
        vendedor_nome: r.vendedor_nome,
        loja_id: r.loja_id,
        loja_nome: r.loja_nome,
        quantidade_vendas: qtdVendas,
        valor_total_vendas: valorTotal,
        valor_comissao: valorComissao
      };
    });

    res.json({
      percentual_aplicado: parsedPercentual,
      periodo: {
        data_inicio: data_inicio || null,
        data_fim: data_fim || null
      },
      vendedores,
      totais: {
        quantidade_vendas: totalQuantidadeVendas,
        valor_total_vendas: parseFloat(totalValorVendas.toFixed(2)),
        valor_comissao: parseFloat(totalComissao.toFixed(2))
      }
    });
  } catch (err) {
    console.error('Erro ao gerar relatório de comissões:', err.message);
    res.status(500).json({ error: 'Erro no servidor ao gerar relatório de comissões' });
  }
});

module.exports = router;
