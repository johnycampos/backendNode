const express = require('express');
const router = express.Router();
const Unidade = require('../models/unidade');

// Listar todas as unidades
router.get('/', async (req, res) => {
  try {
    const unidades = await Unidade.listar();
    res.json(unidades);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Buscar unidade por ID
router.get('/:id', async (req, res) => {
  try {
    const unidade = await Unidade.buscarPorId(req.params.id);
    if (!unidade) {
      return res.status(404).json({ message: 'Unidade não encontrada' });
    }
    res.json(unidade);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar nova unidade
router.post('/', async (req, res) => {
  try {
    const { nome, sigla, descricao } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const novaUnidade = await Unidade.criar({
      nome,
      sigla,
      descricao
    });

    res.status(201).json(novaUnidade);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar unidade
router.put('/:id', async (req, res) => {
  try {
    const { nome, sigla, descricao } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const unidadeAtualizada = await Unidade.atualizar(req.params.id, {
      nome,
      sigla,
      descricao
    });

    if (!unidadeAtualizada) {
      return res.status(404).json({ message: 'Unidade não encontrada' });
    }

    res.json(unidadeAtualizada);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Deletar unidade
router.delete('/:id', async (req, res) => {
  try {
    const unidadeDeletada = await Unidade.deletar(req.params.id);
    if (!unidadeDeletada) {
      return res.status(404).json({ message: 'Unidade não encontrada' });
    }
    res.json({ message: 'Unidade deletada com sucesso' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router; 