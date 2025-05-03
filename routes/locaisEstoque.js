const express = require('express');
const router = express.Router();
const LocalEstoque = require('../models/localEstoque');

// Listar todos os locais de estoque
router.get('/', async (req, res) => {
  try {
    const locais = await LocalEstoque.listar();
    res.json(locais);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Buscar local de estoque por ID
router.get('/:id', async (req, res) => {
  try {
    const local = await LocalEstoque.buscarPorId(req.params.id);
    if (!local) {
      return res.status(404).json({ message: 'Local de estoque não encontrado' });
    }
    res.json(local);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar novo local de estoque
router.post('/', async (req, res) => {
  try {
    const { nome, descricao, endereco } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const novoLocal = await LocalEstoque.criar({
      nome,
      descricao,
      endereco
    });

    res.status(201).json(novoLocal);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar local de estoque
router.put('/:id', async (req, res) => {
  try {
    const { nome, descricao, endereco } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const localAtualizado = await LocalEstoque.atualizar(req.params.id, {
      nome,
      descricao,
      endereco
    });

    if (!localAtualizado) {
      return res.status(404).json({ message: 'Local de estoque não encontrado' });
    }

    res.json(localAtualizado);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Deletar local de estoque
router.delete('/:id', async (req, res) => {
  try {
    const localDeletado = await LocalEstoque.deletar(req.params.id);
    if (!localDeletado) {
      return res.status(404).json({ message: 'Local de estoque não encontrado' });
    }
    res.json({ message: 'Local de estoque deletado com sucesso' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router; 