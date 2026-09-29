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

module.exports = router; 