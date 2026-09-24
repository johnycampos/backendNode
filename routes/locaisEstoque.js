const express = require('express');
const router = express.Router();
const LocalEstoque = require('../models/localEstoque');
const Loja = require('../models/loja');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de locais de estoque requerem autenticação
router.use(authMiddleware);

// Listar locais de estoque (filtrado por loja do usuário, exceto super_admin)
router.get('/', async (req, res) => {
  try {
    const loja_id = req.role === 'super_admin'
      ? (req.query.loja_id ? parseInt(req.query.loja_id, 10) : null)
      : req.lojaId;

    const locais = await LocalEstoque.listar(loja_id);
    res.json(locais);
  } catch (err) {
    console.error('Erro ao listar locais de estoque:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Buscar local de estoque por ID
router.get('/:id', async (req, res) => {
  try {
    const loja_id = req.role === 'super_admin' ? null : req.lojaId;
    const local = await LocalEstoque.buscarPorId(req.params.id, loja_id);
    if (!local) {
      return res.status(404).json({ message: 'Local de estoque não encontrado' });
    }
    res.json(local);
  } catch (err) {
    console.error('Erro ao buscar local de estoque:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar novo local de estoque
router.post('/', async (req, res) => {
  try {
    const { nome, descricao, endereco } = req.body;

    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    let loja_id = req.lojaId;
    if (req.role === 'super_admin' && req.body.loja_id) {
      const lojaValida = await Loja.buscarPorId(req.body.loja_id);
      if (!lojaValida || !lojaValida.ativo) {
        return res.status(400).json({ message: 'Loja informada não existe ou está inativa' });
      }
      loja_id = req.body.loja_id;
    }

    if (!loja_id) {
      return res.status(400).json({ message: 'Loja não identificada para associar ao local de estoque' });
    }

    const novoLocal = await LocalEstoque.criar({
      nome,
      descricao,
      endereco,
      loja_id
    });

    res.status(201).json(novoLocal);
  } catch (err) {
    console.error('Erro ao criar local de estoque:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar local de estoque
router.put('/:id', async (req, res) => {
  try {
    const { nome, descricao, endereco } = req.body;

    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const loja_id = req.role === 'super_admin' ? null : req.lojaId;
    const localAtualizado = await LocalEstoque.atualizar(req.params.id, {
      nome,
      descricao,
      endereco
    }, loja_id);

    if (!localAtualizado) {
      return res.status(404).json({ message: 'Local de estoque não encontrado' });
    }

    res.json(localAtualizado);
  } catch (err) {
    console.error('Erro ao atualizar local de estoque:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Deletar local de estoque
router.delete('/:id', async (req, res) => {
  try {
    const loja_id = req.role === 'super_admin' ? null : req.lojaId;
    const localDeletado = await LocalEstoque.deletar(req.params.id, loja_id);
    if (!localDeletado) {
      return res.status(404).json({ message: 'Local de estoque não encontrado' });
    }
    res.json({ message: 'Local de estoque deletado com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar local de estoque:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router;