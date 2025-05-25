const express = require('express');
const router = express.Router();
const VendaController = require('../controllers/vendaController');
const authMiddleware = require('../middleware/auth');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// Rotas para vendas
router.post('/', VendaController.criar);
router.get('/', VendaController.listar);
router.get('/:id', VendaController.buscarPorId);

module.exports = router; 