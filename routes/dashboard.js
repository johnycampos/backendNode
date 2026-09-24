const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de dashboard exigem autenticação
router.use(authMiddleware);

/**
 * GET /api/dashboard/resumo
 * Retorna totais de vendas (hoje, semana atual, mês atual), ticket médio,
 * itens com estoque baixo (quantidade_disponivel <= quantidade_minima).
 * - Se super_admin: consolidado do grupo e agrupado por loja (ou filtrado por ?loja_id)
 * - Se admin_loja ou funcionario: restrito estritamente à loja do usuário
 */
router.get('/resumo', async (req, res) => {
  try {
    const isSuperAdmin = req.role === 'super_admin';
    let filtroLojaId = null;

    if (!isSuperAdmin) {
      filtroLojaId = req.lojaId;
    } else if (req.query.loja_id) {
      filtroLojaId = parseInt(req.query.loja_id, 10);
    }

    // 1. Métricas de vendas (Geral ou por loja) - filtra apenas lojas ativas
    let vendasQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN v.data_venda >= CURRENT_DATE THEN v.valor_total ELSE 0 END), 0) AS total_hoje,
        COUNT(CASE WHEN v.data_venda >= CURRENT_DATE THEN 1 ELSE NULL END) AS qtd_hoje,
        COALESCE(SUM(CASE WHEN v.data_venda >= DATE_TRUNC('week', CURRENT_TIMESTAMP) THEN v.valor_total ELSE 0 END), 0) AS total_semana,
        COUNT(CASE WHEN v.data_venda >= DATE_TRUNC('week', CURRENT_TIMESTAMP) THEN 1 ELSE NULL END) AS qtd_semana,
        COALESCE(SUM(CASE WHEN v.data_venda >= DATE_TRUNC('month', CURRENT_TIMESTAMP) THEN v.valor_total ELSE 0 END), 0) AS total_mes,
        COUNT(CASE WHEN v.data_venda >= DATE_TRUNC('month', CURRENT_TIMESTAMP) THEN 1 ELSE NULL END) AS qtd_mes
      FROM vendas v
      INNER JOIN lojas l ON v.loja_id = l.id
      WHERE l.ativo = true
    `;
    const vendasParams = [];

    if (filtroLojaId) {
      vendasQuery += ` AND v.loja_id = $1`;
      vendasParams.push(filtroLojaId);
    }

    const { rows: [vendasMetricas] } = await pool.query(vendasQuery, vendasParams);

    const totalHoje = parseFloat(vendasMetricas.total_hoje || 0);
    const qtdHoje = parseInt(vendasMetricas.qtd_hoje || 0, 10);
    const totalSemana = parseFloat(vendasMetricas.total_semana || 0);
    const qtdSemana = parseInt(vendasMetricas.qtd_semana || 0, 10);
    const totalMes = parseFloat(vendasMetricas.total_mes || 0);
    const qtdMes = parseInt(vendasMetricas.qtd_mes || 0, 10);

    const ticketMedioHoje = qtdHoje > 0 ? parseFloat((totalHoje / qtdHoje).toFixed(2)) : 0;
    const ticketMedioMes = qtdMes > 0 ? parseFloat((totalMes / qtdMes).toFixed(2)) : 0;

    // 2. Itens com estoque baixo (apenas lojas ativas)
    let estoqueQuery = `
      SELECT 
        i.id,
        i.nome,
        COALESCE(i.quantidade_disponivel, 0) AS quantidade_disponivel,
        COALESCE(i.quantidade_minima, 0) AS quantidade_minima,
        i.loja_id,
        l.nome AS loja_nome
      FROM itens i
      INNER JOIN lojas l ON i.loja_id = l.id
      WHERE l.ativo = true AND i.quantidade_disponivel <= i.quantidade_minima
    `;
    const estoqueParams = [];

    if (filtroLojaId) {
      estoqueQuery += ` AND i.loja_id = $1`;
      estoqueParams.push(filtroLojaId);
    }

    estoqueQuery += `
      ORDER BY (i.quantidade_disponivel - i.quantidade_minima) ASC, i.nome ASC
      LIMIT 50
    `;

    const { rows: itensEstoqueBaixo } = await pool.query(estoqueQuery, estoqueParams);

    // Contagem total de itens em alerta (apenas lojas ativas)
    let countEstoqueQuery = `
      SELECT COUNT(*) AS total
      FROM itens i
      INNER JOIN lojas l ON i.loja_id = l.id
      WHERE l.ativo = true AND i.quantidade_disponivel <= i.quantidade_minima
    `;
    if (filtroLojaId) {
      countEstoqueQuery += ` AND i.loja_id = $1`;
    }
    const { rows: [{ total: totalItensEstoqueBaixo }] } = await pool.query(countEstoqueQuery, estoqueParams);

    // 3. Agrupamento por loja (se super_admin)
    let porLoja = [];
    if (isSuperAdmin && !filtroLojaId) {
      const lojasQuery = `
        SELECT 
          l.id AS loja_id,
          l.nome AS loja_nome,
          l.is_matriz,
          COALESCE(SUM(CASE WHEN v.data_venda >= CURRENT_DATE THEN v.valor_total ELSE 0 END), 0) AS total_hoje,
          COUNT(CASE WHEN v.data_venda >= CURRENT_DATE THEN 1 ELSE NULL END) AS qtd_hoje,
          COALESCE(SUM(CASE WHEN v.data_venda >= DATE_TRUNC('week', CURRENT_TIMESTAMP) THEN v.valor_total ELSE 0 END), 0) AS total_semana,
          COUNT(CASE WHEN v.data_venda >= DATE_TRUNC('week', CURRENT_TIMESTAMP) THEN 1 ELSE NULL END) AS qtd_semana,
          COALESCE(SUM(CASE WHEN v.data_venda >= DATE_TRUNC('month', CURRENT_TIMESTAMP) THEN v.valor_total ELSE 0 END), 0) AS total_mes,
          COUNT(CASE WHEN v.data_venda >= DATE_TRUNC('month', CURRENT_TIMESTAMP) THEN 1 ELSE NULL END) AS qtd_mes,
          COALESCE(
            (SELECT COUNT(*) FROM itens i WHERE i.loja_id = l.id AND i.quantidade_disponivel <= i.quantidade_minima),
            0
          ) AS itens_estoque_baixo_count
        FROM lojas l
        LEFT JOIN vendas v ON l.id = v.loja_id
        WHERE l.ativo = true
        GROUP BY l.id, l.nome, l.is_matriz
        ORDER BY l.is_matriz DESC, l.id ASC
      `;
      const { rows: lojasRows } = await pool.query(lojasQuery);
      porLoja = lojasRows.map(row => {
        const lTotalHoje = parseFloat(row.total_hoje || 0);
        const lQtdHoje = parseInt(row.qtd_hoje || 0, 10);
        const lTotalMes = parseFloat(row.total_mes || 0);
        const lQtdMes = parseInt(row.qtd_mes || 0, 10);
        return {
          loja_id: row.loja_id,
          loja_nome: row.loja_nome,
          is_matriz: row.is_matriz,
          total_hoje: lTotalHoje,
          qtd_hoje: lQtdHoje,
          total_semana: parseFloat(row.total_semana || 0),
          qtd_semana: parseInt(row.qtd_semana || 0, 10),
          total_mes: lTotalMes,
          qtd_mes: lQtdMes,
          ticket_medio_mes: lQtdMes > 0 ? parseFloat((lTotalMes / lQtdMes).toFixed(2)) : 0,
          ticket_medio_hoje: lQtdHoje > 0 ? parseFloat((lTotalHoje / lQtdHoje).toFixed(2)) : 0,
          itens_estoque_baixo_count: parseInt(row.itens_estoque_baixo_count || 0, 10)
        };
      });
    }

    res.json({
      consolidado: {
        total_hoje: totalHoje,
        qtd_hoje: qtdHoje,
        total_semana: totalSemana,
        qtd_semana: qtdSemana,
        total_mes: totalMes,
        qtd_mes: qtdMes,
        ticket_medio_hoje: ticketMedioHoje,
        ticket_medio_mes: ticketMedioMes,
        itens_estoque_baixo_count: parseInt(totalItensEstoqueBaixo || 0, 10)
      },
      por_loja: porLoja,
      itens_estoque_baixo: itensEstoqueBaixo.map(item => ({
        ...item,
        quantidade_disponivel: parseFloat(item.quantidade_disponivel),
        quantidade_minima: parseFloat(item.quantidade_minima)
      })),
      filtro_loja_id: filtroLojaId
    });
  } catch (err) {
    console.error('Erro ao obter resumo do dashboard:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do dashboard' });
  }
});

/**
 * GET /api/dashboard/comparativo-lojas
 * Exclusivo para super_admin (retorna 403 se não for super_admin).
 * Retorna dados acumulados e histórico dos últimos 30 dias para comparação entre as lojas.
 */
router.get('/comparativo-lojas', async (req, res) => {
  try {
    if (req.role !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores gerais (super_admin)' });
    }

    // 1. Resumo acumulado dos últimos 30 dias por loja
    const resumoQuery = `
      SELECT 
        l.id AS loja_id,
        l.nome AS loja_nome,
        l.is_matriz,
        COUNT(v.id) AS total_vendas,
        COALESCE(SUM(v.valor_total), 0) AS valor_total,
        CASE 
          WHEN COUNT(v.id) > 0 THEN ROUND(COALESCE(SUM(v.valor_total), 0) / COUNT(v.id), 2)
          ELSE 0 
        END AS ticket_medio
      FROM lojas l
      LEFT JOIN vendas v ON l.id = v.loja_id AND v.data_venda >= CURRENT_DATE - INTERVAL '30 days'
      WHERE l.ativo = true
      GROUP BY l.id, l.nome, l.is_matriz
      ORDER BY l.is_matriz DESC, l.id ASC
    `;
    const { rows: resumoLojas } = await pool.query(resumoQuery);

    const totalGrupo = resumoLojas.reduce((acc, curr) => acc + parseFloat(curr.valor_total || 0), 0);

    const lojasFormatadas = resumoLojas.map(l => {
      const valorTotal = parseFloat(l.valor_total || 0);
      return {
        loja_id: l.loja_id,
        loja_nome: l.loja_nome,
        is_matriz: l.is_matriz,
        total_vendas: parseInt(l.total_vendas || 0, 10),
        valor_total: valorTotal,
        ticket_medio: parseFloat(l.ticket_medio || 0),
        participacao_percentual: totalGrupo > 0 ? parseFloat(((valorTotal / totalGrupo) * 100).toFixed(1)) : 0
      };
    });

    // 2. Série histórica diária por loja nos últimos 30 dias
    const serieQuery = `
      SELECT 
        l.id AS loja_id,
        l.nome AS loja_nome,
        TO_CHAR(v.data_venda, 'YYYY-MM-DD') AS dia,
        COUNT(v.id) AS total_vendas,
        COALESCE(SUM(v.valor_total), 0) AS valor_total
      FROM lojas l
      INNER JOIN vendas v ON l.id = v.loja_id
      WHERE l.ativo = true AND v.data_venda >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY l.id, l.nome, TO_CHAR(v.data_venda, 'YYYY-MM-DD')
      ORDER BY dia ASC, l.nome ASC
    `;
    const { rows: serieRows } = await pool.query(serieQuery);

    res.json({
      total_grupo_30_dias: totalGrupo,
      lojas: lojasFormatadas,
      serie_diaria: serieRows.map(r => ({
        loja_id: r.loja_id,
        loja_nome: r.loja_nome,
        dia: r.dia,
        total_vendas: parseInt(r.total_vendas, 10),
        valor_total: parseFloat(r.valor_total)
      }))
    });
  } catch (err) {
    console.error('Erro ao obter comparativo de lojas:', err);
    res.status(500).json({ error: 'Erro ao carregar comparativo de lojas' });
  }
});

module.exports = router;
