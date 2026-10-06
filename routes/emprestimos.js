const express = require('express');
const router = express.Router();
const EmprestimoPeca = require('../models/emprestimoPeca');
const AuditLog = require('../models/auditLog');
const authMiddleware = require('../middleware/auth');
const apenasEstoquista = require('../middleware/apenasEstoquista');

// Todas as rotas de empréstimos requerem autenticação
router.use(authMiddleware);

/**
 * GET /api/emprestimos/estoque-outras-lojas
 * Permite a qualquer usuário autenticado (incluindo funcionários) consultar
 * peças com saldo em estoque nas outras lojas do sistema para solicitar empréstimo.
 */
router.get('/estoque-outras-lojas', async (req, res) => {
  try {
    const itens = await EmprestimoPeca.buscarEstoqueOutrasLojas({
      lojaId: req.lojaId,
      busca: req.query.busca
    });
    res.json(itens);
  } catch (err) {
    console.error('Erro ao consultar estoque de outras lojas:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao consultar estoque de outras lojas' });
  }
});

/**
 * GET /api/emprestimos/por-item-destino/:itemId
 * Consulta se um item específico no estoque foi originado de um empréstimo aprovado.
 */
router.get('/por-item-destino/:itemId', async (req, res) => {
  try {
    const emprestimo = await EmprestimoPeca.buscarPorItemDestino(req.params.itemId);
    res.json(emprestimo);
  } catch (err) {
    console.error('Erro ao consultar empréstimo por item destino:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao consultar empréstimo' });
  }
});

/**
 * GET /api/emprestimos/itens-emprestados
 * Lista itens recebidos por empréstimo para exibir indicador na listagem de estoque.
 */
router.get('/itens-emprestados', async (req, res) => {
  try {
    const lojaId = req.role === 'super_admin' ? null : req.lojaId;
    const itens = await EmprestimoPeca.listarItensEmprestadosRecebidos(lojaId);
    res.json(itens);
  } catch (err) {
    console.error('Erro ao listar itens emprestados recebidos:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao listar itens emprestados' });
  }
});

/**
 * POST /api/emprestimos
 * Solicitar empréstimo de uma peça de outra loja.
 * Qualquer usuário autenticado (funcionário, admin_loja, super_admin).
 * loja_destino_id é SEMPRE req.lojaId (apenas super_admin pode opcionalmente definir via body).
 */
router.post('/', async (req, res) => {
  try {
    const { item_origem_id, quantidade, observacoes } = req.body;

    let lojaDestinoId = req.lojaId;
    if (req.role === 'super_admin' && req.body.loja_destino_id) {
      lojaDestinoId = parseInt(req.body.loja_destino_id, 10);
    }

    if (!lojaDestinoId) {
      return res.status(400).json({ error: 'Loja de destino não identificada' });
    }

    const emprestimo = await EmprestimoPeca.criar({
      itemOrigemId: item_origem_id,
      quantidade,
      lojaDestinoId,
      solicitanteId: req.userId,
      observacoes
    });

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, emprestimo.loja_destino_id, 'solicitar_emprestimo', 'emprestimos_pecas', emprestimo.id, {
      item_origem_id: emprestimo.item_origem_id,
      codigo_item: emprestimo.codigo_item,
      nome_item: emprestimo.nome_item,
      quantidade: emprestimo.quantidade,
      loja_origem_id: emprestimo.loja_origem_id
    });

    res.status(201).json(emprestimo);
  } catch (err) {
    console.error('Erro ao solicitar empréstimo:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao solicitar empréstimo' });
  }
});

/**
 * GET /api/emprestimos
 * Lista empréstimos respeitando o escopo de tenant e papéis:
 * - super_admin: vê todos
 * - admin_loja OU funcionário com flag "estoquista": vê os que envolvem sua loja (origem ou destino)
 * - funcionario comum: vê apenas suas próprias solicitações
 */
router.get('/', async (req, res) => {
  try {
    const { status, como_origem, como_destino } = req.query;

    const emprestimos = await EmprestimoPeca.listar({
      role: req.role,
      estoquista: req.estoquista,
      lojaId: req.lojaId,
      userId: req.userId,
      status: status || null,
      comoOrigem: como_origem === 'true',
      comoDestino: como_destino === 'true'
    });

    res.json(emprestimos);
  } catch (err) {
    console.error('Erro ao listar empréstimos:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao listar empréstimos' });
  }
});

/**
 * GET /api/emprestimos/:id
 * Busca um empréstimo por ID com validação de visibilidade por tenant/papel.
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'ID do empréstimo inválido' });
    }

    const emprestimo = await EmprestimoPeca.buscarPorId(id);
    if (!emprestimo) {
      return res.status(404).json({ error: 'Empréstimo não encontrado' });
    }

    // Validação de acesso por escopo
    if (req.role === 'admin_loja') {
      if (
        Number(emprestimo.loja_origem_id) !== Number(req.lojaId) &&
        Number(emprestimo.loja_destino_id) !== Number(req.lojaId)
      ) {
        return res.status(403).json({ error: 'Você não tem permissão para visualizar este empréstimo' });
      }
    } else if (req.role === 'funcionario') {
      if (Number(emprestimo.solicitante_id) !== Number(req.userId)) {
        return res.status(403).json({ error: 'Você não tem permissão para visualizar este empréstimo' });
      }
    }

    res.json(emprestimo);
  } catch (err) {
    console.error('Erro ao buscar empréstimo:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao buscar empréstimo' });
  }
});

/**
 * PUT /api/emprestimos/:id/aprovar
 * Aprova o empréstimo, decrementa o estoque da loja de origem e credita na de destino.
 * admin_loja (gerente) da loja de origem, super_admin, ou funcionário com flag "estoquista".
 */
router.put('/:id/aprovar', apenasEstoquista, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'ID do empréstimo inválido' });
    }

    const aprovado = await EmprestimoPeca.aprovar({
      id,
      aprovadorId: req.userId,
      lojaAdmin: req.lojaId,
      roleAdmin: req.role
    });

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, aprovado.loja_origem_id, 'aprovar_emprestimo', 'emprestimos_pecas', aprovado.id, {
      codigo_item: aprovado.codigo_item,
      nome_item: aprovado.nome_item,
      quantidade: aprovado.quantidade,
      item_destino_id: aprovado.item_destino_id,
      loja_destino_id: aprovado.loja_destino_id
    });

    res.json({
      message: 'Empréstimo aprovado com sucesso e estoque atualizado',
      emprestimo: aprovado
    });
  } catch (err) {
    console.error('Erro ao aprovar empréstimo:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao aprovar empréstimo' });
  }
});

/**
 * PUT /api/emprestimos/:id/rejeitar
 * Rejeita o empréstimo com motivo opcional.
 * admin_loja (gerente) da loja de origem, super_admin, ou funcionário com flag "estoquista".
 */
router.put('/:id/rejeitar', apenasEstoquista, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'ID do empréstimo inválido' });
    }

    const { motivo } = req.body;

    const rejeitado = await EmprestimoPeca.rejeitar({
      id,
      aprovadorId: req.userId,
      motivo,
      lojaAdmin: req.lojaId,
      roleAdmin: req.role
    });

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, rejeitado.loja_origem_id, 'rejeitar_emprestimo', 'emprestimos_pecas', rejeitado.id, {
      codigo_item: rejeitado.codigo_item,
      motivo
    });

    res.json({
      message: 'Empréstimo rejeitado com sucesso',
      emprestimo: rejeitado
    });
  } catch (err) {
    console.error('Erro ao rejeitar empréstimo:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao rejeitar empréstimo' });
  }
});

/**
 * PUT /api/emprestimos/:id/pagamento
 * Registra o pagamento financeiro referente ao empréstimo de peças.
 * admin_loja (gerente), super_admin, ou funcionário com flag "estoquista".
 */
router.put('/:id/pagamento', apenasEstoquista, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'ID do empréstimo inválido' });
    }

    const { forma_pagamento } = req.body;

    if (!forma_pagamento) {
      return res.status(400).json({ error: 'Forma de pagamento é obrigatória' });
    }

    const pago = await EmprestimoPeca.registrarPagamento({
      id,
      formaPagamento: forma_pagamento,
      registradoPor: req.userId,
      lojaAdmin: req.lojaId,
      roleAdmin: req.role
    });

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, pago.loja_origem_id, 'registrar_pagamento_emprestimo', 'emprestimos_pecas', pago.id, {
      forma_pagamento: pago.forma_pagamento,
      codigo_item: pago.codigo_item,
      quantidade: pago.quantidade
    });

    res.json({
      message: 'Pagamento do empréstimo registrado com sucesso',
      emprestimo: pago
    });
  } catch (err) {
    console.error('Erro ao registrar pagamento de empréstimo:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao registrar pagamento' });
  }
});

module.exports = router;
