const Venda = require('../models/venda');
const Item = require('../models/item');
const Loja = require('../models/loja');

class VendaController {
  static async criar(req, res) {
    try {
      const vendaData = req.body;

      // Validações básicas
      if (!vendaData.itens || !Array.isArray(vendaData.itens) || vendaData.itens.length === 0) {
        return res.status(400).json({ error: 'A venda deve conter pelo menos um item' });
      }

      // Atribuir loja_id validando se fornecido por super_admin
      let loja_id = req.lojaId;
      if (req.role === 'super_admin' && req.body.loja_id) {
        const lojaValida = await Loja.buscarPorId(req.body.loja_id);
        if (!lojaValida || !lojaValida.ativo) {
          return res.status(400).json({ error: 'Loja informada não existe ou está inativa' });
        }
        loja_id = req.body.loja_id;
      }

      vendaData.loja_id = loja_id;

      if (!vendaData.loja_id) {
        return res.status(400).json({ error: 'ID da loja é obrigatório' });
      }

      if (!vendaData.vendedor_id) {
        vendaData.vendedor_id = req.userId;
      }

      if (!vendaData.forma_pagamento) {
        return res.status(400).json({ error: 'Forma de pagamento é obrigatória' });
      }

      if (vendaData.forma_pagamento === 'Cartão' && !vendaData.parcelas) {
        return res.status(400).json({ error: 'Número de parcelas é obrigatório para pagamento com cartão' });
      }

      if (!vendaData.valor_total) {
        return res.status(400).json({ error: 'Valor total é obrigatório' });
      }

      // Verificar se todos os itens existem na loja da venda
      for (const item of vendaData.itens) {
        const itemExiste = await Item.buscarPorId(item.item_id, vendaData.loja_id);
        if (!itemExiste) {
          return res.status(400).json({ 
            error: `Item com ID ${item.item_id} não encontrado na loja`,
            item_id: item.item_id
          });
        }

        // Verificar se há estoque suficiente
        if (Number(itemExiste.quantidade_disponivel) < Number(item.quantidade)) {
          return res.status(400).json({ 
            error: `Estoque insuficiente para o item ${itemExiste.nome}`,
            item_id: item.item_id,
            quantidade_solicitada: item.quantidade,
            quantidade_disponivel: itemExiste.quantidade_disponivel
          });
        }
      }

      // Calcular valor total da venda
      const valorTotalCalculado = vendaData.itens.reduce((total, item) => {
        return total + (item.quantidade * item.preco_unitario);
      }, 0);

      // Validar se o valor total enviado corresponde ao calculado
      if (Math.abs(valorTotalCalculado - vendaData.valor_total) > 0.01) {
        return res.status(400).json({ 
          error: 'Valor total não corresponde à soma dos itens',
          valor_calculado: valorTotalCalculado,
          valor_enviado: vendaData.valor_total
        });
      }

      const venda = await Venda.criar(vendaData);
      res.status(201).json(venda);
    } catch (error) {
      console.error('Erro ao criar venda:', error);
      res.status(500).json({ error: 'Erro ao criar venda' });
    }
  }

  static async buscarPorId(req, res) {
    try {
      const loja_id = req.role === 'super_admin' ? null : req.lojaId;
      const venda = await Venda.buscarPorId(req.params.id, loja_id);
      if (!venda) {
        return res.status(404).json({ error: 'Venda não encontrada' });
      }
      res.json(venda);
    } catch (error) {
      console.error('Erro ao buscar venda:', error);
      res.status(500).json({ error: 'Erro ao buscar venda' });
    }
  }

  static async listar(req, res) {
    try {
      const loja_id = req.role === 'super_admin'
        ? (req.query.loja_id ? parseInt(req.query.loja_id, 10) : null)
        : req.lojaId;

      const vendas = await Venda.listar(loja_id);
      res.json(vendas);
    } catch (error) {
      console.error('Erro ao listar vendas:', error);
      res.status(500).json({ error: 'Erro ao listar vendas' });
    }
  }
}

module.exports = VendaController;