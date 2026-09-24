const Item = require('../models/item');
const Loja = require('../models/loja');
const AuditLog = require('../models/auditLog');

class ItemController {
  static async criar(req, res) {
    try {
      let loja_id = req.lojaId;
      if (req.role === 'super_admin' && req.body.loja_id) {
        const lojaValida = await Loja.buscarPorId(req.body.loja_id);
        if (!lojaValida || !lojaValida.ativo) {
          return res.status(400).json({ error: 'Loja informada não existe ou está inativa' });
        }
        loja_id = req.body.loja_id;
      }

      if (!loja_id) {
        return res.status(400).json({ error: 'Loja não identificada para associar ao item' });
      }

      const item = await Item.criar({
        ...req.body,
        loja_id
      });
      res.status(201).json(item);
    } catch (error) {
      console.error('Erro ao criar item:', error);
      res.status(500).json({ error: 'Erro ao criar item' });
    }
  }

  static async listar(req, res) {
    try {
      // super_admin pode ver tudo ou filtrar por query param ?loja_id=X
      // os demais papéis só veem a própria loja
      const loja_id = req.role === 'super_admin'
        ? (req.query.loja_id ? parseInt(req.query.loja_id, 10) : null)
        : req.lojaId;

      const itens = await Item.listar(loja_id);
      res.json(itens);
    } catch (error) {
      console.error('Erro ao listar itens:', error);
      res.status(500).json({ error: 'Erro ao listar itens' });
    }
  }

  static async buscarPorId(req, res) {
    try {
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.buscarPorId(req.params.id, loja_id);
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
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.buscarPorCodigo(req.params.codigo, loja_id);
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
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.atualizar(req.params.id, req.body, loja_id);
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
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.deletar(req.params.id, loja_id);
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
      const { quantidade, operacao } = req.body;
      
      if (!operacao || !['adicionar', 'remover'].includes(operacao)) {
        return res.status(400).json({ error: 'Operação inválida. Use "adicionar" ou "remover"' });
      }

      const quantidadeAjustada = operacao === 'adicionar' ? quantidade : -quantidade;
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      
      const item = await Item.atualizarEstoque(req.params.id, quantidadeAjustada, loja_id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, item.loja_id, 'ajuste_estoque', 'itens', item.id, {
        operacao,
        quantidade,
        nova_quantidade: item.quantidade_disponivel
      });

      res.json(item);
    } catch (error) {
      console.error('Erro ao atualizar estoque:', error);
      res.status(500).json({ error: 'Erro ao atualizar estoque' });
    }
  }
}

module.exports = ItemController;