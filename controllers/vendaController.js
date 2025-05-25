const Venda = require('../models/venda');
const Item = require('../models/item');

class VendaController {
  static async criar(req, res) {
    try {
      const vendaData = req.body;

      // Validações básicas
      if (!vendaData.itens || !Array.isArray(vendaData.itens) || vendaData.itens.length === 0) {
        return res.status(400).json({ error: 'A venda deve conter pelo menos um item' });
      }

      if (!vendaData.loja_id) {
        return res.status(400).json({ error: 'ID da loja é obrigatório' });
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

      // Verificar se todos os itens existem
      for (const item of vendaData.itens) {
        const itemExiste = await Item.buscarPorId(item.item_id);
        if (!itemExiste) {
          return res.status(400).json({ 
            error: `Item com ID ${item.item_id} não encontrado`,
            item_id: item.item_id
          });
        }

        // Verificar se há estoque suficiente
        if (itemExiste.quantidade_disponivel < item.quantidade) {
          return res.status(400).json({ 
            error: `Estoque insuficiente para o item ${item.item_id}`,
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
      const venda = await Venda.buscarPorId(req.params.id);
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
      const vendas = await Venda.listar();
      res.json(vendas);
    } catch (error) {
      console.error('Erro ao listar vendas:', error);
      res.status(500).json({ error: 'Erro ao listar vendas' });
    }
  }
}

module.exports = VendaController; 