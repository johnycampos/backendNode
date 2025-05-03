const Item = require('../models/item');

class ItemController {
  static async criar(req, res) {
    try {
      const item = await Item.criar(req.body);
      res.status(201).json(item);
    } catch (error) {
      console.error('Erro ao criar item:', error);
      res.status(500).json({ error: 'Erro ao criar item' });
    }
  }

  static async listar(req, res) {
    try {
      const itens = await Item.listar();
      res.json(itens);
    } catch (error) {
      console.error('Erro ao listar itens:', error);
      res.status(500).json({ error: 'Erro ao listar itens' });
    }
  }

  static async buscarPorId(req, res) {
    try {
      const item = await Item.buscarPorId(req.params.id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      res.json(item);
    } catch (error) {
      console.error('Erro ao buscar item:', error);
      res.status(500).json({ error: 'Erro ao buscar item' });
    }
  }

  static async buscarPorCodigo(req, res) {
    try {
      const item = await Item.buscarPorCodigo(req.params.codigo);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      res.json(item);
    } catch (error) {
      console.error('Erro ao buscar item:', error);
      res.status(500).json({ error: 'Erro ao buscar item' });
    }
  }

  static async atualizar(req, res) {
    try {
      const item = await Item.atualizar(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      res.json(item);
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      res.status(500).json({ error: 'Erro ao atualizar item' });
    }
  }

  static async deletar(req, res) {
    try {
      const item = await Item.deletar(req.params.id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      res.json({ message: 'Item deletado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar item:', error);
      res.status(500).json({ error: 'Erro ao deletar item' });
    }
  }

  static async atualizarEstoque(req, res) {
    try {
      const { quantidade } = req.body;
      const item = await Item.atualizarEstoque(req.params.id, quantidade);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      res.json(item);
    } catch (error) {
      console.error('Erro ao atualizar estoque:', error);
      res.status(500).json({ error: 'Erro ao atualizar estoque' });
    }
  }
}

module.exports = ItemController; 