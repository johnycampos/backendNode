const express = require('express');
const router = express.Router();
const Fabricante = require('../models/fabricante');

// Listar todos os fabricantes
router.get('/', async (req, res) => {
  try {
    const fabricantes = await Fabricante.listar();
    res.json(fabricantes);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Buscar fabricante por ID
router.get('/:id', async (req, res) => {
  try {
    const fabricante = await Fabricante.buscarPorId(req.params.id);
    if (!fabricante) {
      return res.status(404).json({ message: 'Fabricante não encontrado' });
    }
    res.json(fabricante);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar novo fabricante
router.post('/', async (req, res) => {
  try {
    const { nome, cnpj, contato, telefone, email, observacoes } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const novoFabricante = await Fabricante.criar({
      nome,
      cnpj,
      contato,
      telefone,
      email,
      observacoes
    });

    res.status(201).json(novoFabricante);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar fabricante
router.put('/:id', async (req, res) => {
  try {
    const { nome, cnpj, contato, telefone, email, observacoes } = req.body;

    // Validação básica
    if (!nome) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const fabricanteAtualizado = await Fabricante.atualizar(req.params.id, {
      nome,
      cnpj,
      contato,
      telefone,
      email,
      observacoes
    });

    if (!fabricanteAtualizado) {
      return res.status(404).json({ message: 'Fabricante não encontrado' });
    }

    res.json(fabricanteAtualizado);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Deletar fabricante
router.delete('/:id', async (req, res) => {
  try {
    const fabricanteDeletado = await Fabricante.deletar(req.params.id);
    if (!fabricanteDeletado) {
      return res.status(404).json({ message: 'Fabricante não encontrado' });
    }
    res.json({ message: 'Fabricante deletado com sucesso' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router; 