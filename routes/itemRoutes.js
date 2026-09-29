const express = require('express');
const router = express.Router();
const ItemController = require('../controllers/itemController');
const authMiddleware = require('../middleware/auth');
const apenasEstoquista = require('../middleware/apenasEstoquista');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// Rotas para itens
router.get('/', ItemController.listar);
router.get('/:id', ItemController.buscarPorId);
router.get('/codigo/:codigo', ItemController.buscarPorCodigo);
router.post('/', apenasEstoquista, ItemController.criar);
router.put('/:id', apenasEstoquista, ItemController.atualizar);
router.delete('/:id', apenasEstoquista, ItemController.deletar);
router.patch('/:id/estoque', apenasEstoquista, ItemController.atualizarEstoque);

// Vínculo item <-> fornecedores
router.get('/:id/fornecedores', ItemController.listarFornecedores);
router.post('/:id/fornecedores', apenasEstoquista, ItemController.adicionarFornecedor);
router.delete('/:id/fornecedores/:fornecedorId', apenasEstoquista, ItemController.removerFornecedor);

module.exports = router; 