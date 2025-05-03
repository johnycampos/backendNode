const express = require('express');
const router = express.Router();
const ItemController = require('../controllers/itemController');
const authMiddleware = require('../middleware/auth');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// Rotas para itens
router.post('/', ItemController.criar);
router.get('/', ItemController.listar);
router.get('/:id', ItemController.buscarPorId);
router.get('/codigo/:codigo', ItemController.buscarPorCodigo);
router.put('/:id', ItemController.atualizar);
router.delete('/:id', ItemController.deletar);
router.patch('/:id/estoque', ItemController.atualizarEstoque);

module.exports = router; 