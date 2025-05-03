const express = require('express');
const router = express.Router();
const Subgrupo = require('../models/subgrupo');

// Listar todos os subgrupos
router.get('/', async (req, res) => {
  try {
    const subgrupos = await Subgrupo.listar();
    res.json(subgrupos);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Listar subgrupos por grupo
router.get('/grupo/:grupo_id', async (req, res) => {
  try {
    const subgrupos = await Subgrupo.listarPorGrupo(req.params.grupo_id);
    res.json(subgrupos);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Buscar subgrupo por ID
router.get('/:id', async (req, res) => {
  try {
    const subgrupo = await Subgrupo.buscarPorId(req.params.id);
    if (!subgrupo) {
      return res.status(404).json({ message: 'Subgrupo não encontrado' });
    }
    res.json(subgrupo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar novo subgrupo
router.post('/', async (req, res) => {
  try {
    const { nome, descricao, grupo_id } = req.body;

    // Validação básica
    if (!nome || !grupo_id) {
      return res.status(400).json({ 
        message: 'Dados inválidos',
        errors: {
          nome: !nome ? 'Nome é obrigatório' : null,
          grupo_id: !grupo_id ? 'Grupo é obrigatório' : null
        }
      });
    }

    const novoSubgrupo = await Subgrupo.criar({
      nome,
      descricao,
      grupo_id
    });

    res.status(201).json(novoSubgrupo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar subgrupo
router.put('/:id', async (req, res) => {
  try {
    const { nome, descricao, grupo_id } = req.body;

    // Validação básica
    if (!nome || !grupo_id) {
      return res.status(400).json({ 
        message: 'Dados inválidos',
        errors: {
          nome: !nome ? 'Nome é obrigatório' : null,
          grupo_id: !grupo_id ? 'Grupo é obrigatório' : null
        }
      });
    }

    const subgrupoAtualizado = await Subgrupo.atualizar(req.params.id, {
      nome,
      descricao,
      grupo_id
    });

    if (!subgrupoAtualizado) {
      return res.status(404).json({ message: 'Subgrupo não encontrado' });
    }

    res.json(subgrupoAtualizado);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Deletar subgrupo
router.delete('/:id', async (req, res) => {
  try {
    const subgrupoDeletado = await Subgrupo.deletar(req.params.id);
    if (!subgrupoDeletado) {
      return res.status(404).json({ message: 'Subgrupo não encontrado' });
    }
    res.json({ message: 'Subgrupo deletado com sucesso' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router; 