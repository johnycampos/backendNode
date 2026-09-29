const express = require('express');
const router = express.Router();
const FornecedorController = require('../controllers/fornecedorController');
const authMiddleware = require('../middleware/auth');
const apenasEstoquista = require('../middleware/apenasEstoquista');

// Todas as rotas de fornecedores requerem autenticação
router.use(authMiddleware);

// Leitura pública para qualquer autenticado (para selecionar no cadastro/edição de itens)
router.get('/', FornecedorController.listar);
router.get('/:id', FornecedorController.buscarPorId);

// Escrita restrita a estoquista (ou admin_loja / super_admin)
router.post('/', apenasEstoquista, FornecedorController.criar);
router.put('/:id', apenasEstoquista, FornecedorController.atualizar);
router.delete('/:id', apenasEstoquista, FornecedorController.deletar);

module.exports = router;
