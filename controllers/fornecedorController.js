const Fornecedor = require('../models/fornecedor');
const AuditLog = require('../models/auditLog');

class FornecedorController {
  static async listar(req, res) {
    try {
      const fornecedores = await Fornecedor.listar();
      res.json(fornecedores);
    } catch (err) {
      console.error('Erro ao listar fornecedores:', err);
      res.status(500).json({ message: 'Erro no servidor' });
    }
  }

  static async buscarPorId(req, res) {
    try {
      const fornecedor = await Fornecedor.buscarPorId(req.params.id);
      if (!fornecedor) {
        return res.status(404).json({ message: 'Fornecedor não encontrado' });
      }
      res.json(fornecedor);
    } catch (err) {
      console.error('Erro ao buscar fornecedor:', err);
      res.status(500).json({ message: 'Erro no servidor' });
    }
  }

  static async criar(req, res) {
    try {
      const { codigo, nome, cnpj, fone, cidade, uf } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({ message: 'Nome é obrigatório' });
      }

      const novoFornecedor = await Fornecedor.criar({
        codigo: codigo ? codigo.trim() : null,
        nome: nome.trim(),
        cnpj: cnpj ? cnpj.trim() : null,
        fone: fone ? fone.trim() : null,
        cidade: cidade ? cidade.trim() : null,
        uf: uf ? uf.trim().toUpperCase() : null
      });

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, req.lojaId, 'criar_fornecedor', 'fornecedores', novoFornecedor.id, {
        codigo: novoFornecedor.codigo,
        nome: novoFornecedor.nome,
        cnpj: novoFornecedor.cnpj
      });

      res.status(201).json(novoFornecedor);
    } catch (err) {
      console.error('Erro ao criar fornecedor:', err);
      res.status(500).json({ message: 'Erro no servidor' });
    }
  }

  static async atualizar(req, res) {
    try {
      const { codigo, nome, cnpj, fone, cidade, uf } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({ message: 'Nome é obrigatório' });
      }

      const fornecedorAtualizado = await Fornecedor.atualizar(req.params.id, {
        codigo: codigo ? codigo.trim() : null,
        nome: nome.trim(),
        cnpj: cnpj ? cnpj.trim() : null,
        fone: fone ? fone.trim() : null,
        cidade: cidade ? cidade.trim() : null,
        uf: uf ? uf.trim().toUpperCase() : null
      });

      if (!fornecedorAtualizado) {
        return res.status(404).json({ message: 'Fornecedor não encontrado' });
      }

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, req.lojaId, 'atualizar_fornecedor', 'fornecedores', fornecedorAtualizado.id, {
        codigo: fornecedorAtualizado.codigo,
        nome: fornecedorAtualizado.nome
      });

      res.json(fornecedorAtualizado);
    } catch (err) {
      console.error('Erro ao atualizar fornecedor:', err);
      res.status(500).json({ message: 'Erro no servidor' });
    }
  }

  static async deletar(req, res) {
    try {
      const fornecedorDeletado = await Fornecedor.deletar(req.params.id);
      if (!fornecedorDeletado) {
        return res.status(404).json({ message: 'Fornecedor não encontrado' });
      }

      // Auditoria (fire-and-forget)
      AuditLog.registrar(req.userId, req.lojaId, 'deletar_fornecedor', 'fornecedores', fornecedorDeletado.id, {
        nome: fornecedorDeletado.nome
      });

      res.json({ message: 'Fornecedor deletado com sucesso' });
    } catch (err) {
      console.error('Erro ao deletar fornecedor:', err);
      res.status(500).json({ message: 'Erro no servidor' });
    }
  }
}

module.exports = FornecedorController;
