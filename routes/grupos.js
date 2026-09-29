const express = require('express');
const router = express.Router();
const Grupo = require('../models/grupo');
const AuditLog = require('../models/auditLog');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de grupos requerem autenticação
router.use(authMiddleware);

// Listar todos os grupos
router.get('/', async (req, res) => {
  try {
    const grupos = await Grupo.listar();
    res.json(grupos);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Buscar grupo por ID
router.get('/:id', async (req, res) => {
  try {
    const grupo = await Grupo.buscarPorId(req.params.id);
    if (!grupo) {
      return res.status(404).json({ message: 'Grupo não encontrado' });
    }
    res.json(grupo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar novo grupo
router.post('/', async (req, res) => {
  try {
    const { nome, descricao } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const novoGrupo = await Grupo.criar({
      nome,
      descricao
    });

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, req.lojaId, 'criar_grupo', 'grupos', novoGrupo.id, {
      nome: novoGrupo.nome
    });

    res.status(201).json(novoGrupo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar grupo
router.put('/:id', async (req, res) => {
  try {
    const { nome, descricao } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const grupoAtualizado = await Grupo.atualizar(req.params.id, {
      nome,
      descricao
    });

    if (!grupoAtualizado) {
      return res.status(404).json({ message: 'Grupo não encontrado' });
    }

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, req.lojaId, 'atualizar_grupo', 'grupos', grupoAtualizado.id, {
      nome: grupoAtualizado.nome
    });

    res.json(grupoAtualizado);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Deletar grupo
router.delete('/:id', async (req, res) => {
  try {
    const grupoDeletado = await Grupo.deletar(req.params.id);
    if (!grupoDeletado) {
      return res.status(404).json({ message: 'Grupo não encontrado' });
    }

    // Auditoria (fire-and-forget)
    AuditLog.registrar(req.userId, req.lojaId, 'deletar_grupo', 'grupos', grupoDeletado.id, {
      nome: grupoDeletado.nome
    });

    res.json({ message: 'Grupo deletado com sucesso' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router; 