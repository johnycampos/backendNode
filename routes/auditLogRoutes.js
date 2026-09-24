const express = require('express');
const router = express.Router();
const AuditLog = require('../models/auditLog');
const authMiddleware = require('../middleware/auth');
const apenasAdmin = require('../middleware/apenasAdmin');

// Proteção: apenas administradores (admin_loja ou super_admin)
router.use(authMiddleware);
router.use(apenasAdmin);

/**
 * GET /api/audit-log
 * Lista registros de auditoria com paginação e filtro por loja
 * - super_admin: pode filtrar por qualquer loja ou ver todas
 * - admin_loja: restrito estritamente aos registros da própria loja
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const acao = req.query.acao || null;
    const usuarioId = req.query.usuario_id ? parseInt(req.query.usuario_id, 10) : null;

    let lojaId = null;
    if (req.role === 'admin_loja') {
      lojaId = req.lojaId;
    } else if (req.query.loja_id) {
      lojaId = parseInt(req.query.loja_id, 10);
    }

    const logs = await AuditLog.listar({
      lojaId,
      usuarioId,
      acao,
      limite: limit,
      offset
    });

    res.json({
      total_retornado: logs.length,
      limit,
      offset,
      logs
    });
  } catch (err) {
    console.error('Erro ao listar audit-log:', err.message);
    res.status(500).json({ error: 'Erro ao carregar registros de auditoria' });
  }
});

module.exports = router;
