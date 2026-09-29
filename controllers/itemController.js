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

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, item.loja_id, 'criar_item', 'itens', item.id, {
        codigo: item.codigo,
        nome: item.nome,
        quantidade_disponivel: item.quantidade_disponivel
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

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, item.loja_id, 'atualizar_item', 'itens', item.id, {
        codigo: item.codigo,
        nome: item.nome,
        quantidade_disponivel: item.quantidade_disponivel,
        valor: item.valor
      });

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

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, item.loja_id || req.lojaId, 'deletar_item', 'itens', item.id, {
        codigo: item.codigo,
        nome: item.nome
      });

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

  static async listarFornecedores(req, res) {
    try {
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.buscarPorId(req.params.id, loja_id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }

      const fornecedores = await Item.listarFornecedores(req.params.id);
      res.json(fornecedores);
    } catch (error) {
      console.error('Erro ao listar fornecedores do item:', error);
      res.status(500).json({ error: 'Erro ao listar fornecedores do item' });
    }
  }

  static async adicionarFornecedor(req, res) {
    try {
      const fornecedor_id = req.body.fornecedor_id || req.body.fornecedorId;
      if (!fornecedor_id) {
        return res.status(400).json({ error: 'fornecedor_id é obrigatório' });
      }

      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.buscarPorId(req.params.id, loja_id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }

      const vinculo = await Item.adicionarFornecedor(req.params.id, fornecedor_id);

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, item.loja_id || req.lojaId, 'vincular_fornecedor_item', 'itens', item.id, {
        fornecedor_id: Number(fornecedor_id)
      });

      res.status(201).json(vinculo);
    } catch (error) {
      console.error('Erro ao adicionar fornecedor ao item:', error);
      res.status(500).json({ error: 'Erro ao adicionar fornecedor ao item' });
    }
  }

  static async removerFornecedor(req, res) {
    try {
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const item = await Item.buscarPorId(req.params.id, loja_id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }

      await Item.removerFornecedor(req.params.id, req.params.fornecedorId);

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, item.loja_id || req.lojaId, 'desvincular_fornecedor_item', 'itens', item.id, {
        fornecedor_id: Number(req.params.fornecedorId)
      });

      res.json({ message: 'Vínculo removido com sucesso' });
    } catch (error) {
      console.error('Erro ao remover fornecedor do item:', error);
      res.status(500).json({ error: 'Erro ao remover fornecedor do item' });
    }
  }
}

module.exports = ItemController;