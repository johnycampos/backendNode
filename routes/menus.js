const express = require('express');
const router = express.Router();
const Menu = require('../models/menu');
const authMiddleware = require('../middleware/auth');
const apenasAdmin = require('../middleware/apenasAdmin');

router.use(authMiddleware);
router.use(apenasAdmin);

// Listar todos os menus do sistema (para configuração de permissões)
router.get('/', async (req, res) => {
  try {
    const menus = await Menu.listarTodos();
    res.json(menus);
  } catch (err) {
    console.error('Erro ao listar menus:', err.message);
    res.status(500).json({ error: 'Erro ao listar menus' });
  }
});

module.exports = router;
