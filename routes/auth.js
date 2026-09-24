const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuario');
const Loja = require('../models/loja');
const Menu = require('../models/menu');
const HorarioPermitido = require('../models/horarioPermitido');
const authMiddleware = require('../middleware/auth');

// Listar lojas ativas (para seleção em login/cadastro ou contexto)
router.get('/lojas', async (req, res) => {
  try {
    const lojas = await Loja.listar();
    res.json(lojas);
  } catch (err) {
    console.error('Erro ao listar lojas:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Endpoint de perfil e menus habilitados do usuário logado
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await Usuario.buscarPorId(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const menusHabilitados = await Menu.listarHabilitadosPorUsuario(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        loja_id: user.loja_id,
        loja_nome: user.loja_nome,
        is_matriz: user.is_matriz
      },
      menus: menusHabilitados,
      menusChaves: menusHabilitados.map(m => m.chave)
    });
  } catch (err) {
    console.error('Erro em /auth/me:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Registro
router.post('/register', async (req, res) => {
  try {
    let { username, password, loja_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Dados inválidos',
        errors: {
          username: !username ? 'Username é obrigatório' : null,
          password: !password ? 'Password é obrigatório' : null
        }
      });
    }

    // Se loja_id não fornecido, vincula à matriz por default
    if (!loja_id) {
      const matriz = await Loja.buscarMatriz();
      if (!matriz) {
        return res.status(400).json({ message: 'Nenhuma loja matriz encontrada no sistema' });
      }
      loja_id = matriz.id;
    } else {
      const lojaExiste = await Loja.buscarPorId(loja_id);
      if (!lojaExiste || !lojaExiste.ativo) {
        return res.status(400).json({ message: 'Loja informada não existe ou está inativa' });
      }
    }

    // Registro público SEMPRE força role='funcionario' para evitar autopromoção
    // Criação de admin_loja e super_admin é exclusiva de administradores autenticados (Fase 5)
    const role = 'funcionario';

    // Verifica se o usuário já existe
    const userExists = await Usuario.buscarPorUsername(username);
    if (userExists) {
      return res.status(400).json({ message: 'Usuário já existe' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insere usuário no banco de dados
    const novoUsuario = await Usuario.criar({
      username,
      password: hashedPassword,
      role,
      loja_id
    });

    res.status(201).json({ 
      message: 'Usuário registrado com sucesso',
      user: novoUsuario
    });
  } catch (err) {
    console.error('Erro no registro:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validação dos campos obrigatórios
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Dados inválidos',
        errors: {
          username: !username ? 'Username é obrigatório' : null,
          password: !password ? 'Password é obrigatório' : null
        }
      });
    }

    // Verifica se o usuário existe
    const user = await Usuario.buscarPorUsername(username);
    if (!user) return res.status(400).json({ message: 'Login inválido' });

    // Verifica se o usuário está ativo
    if (user.ativo === false) {
      return res.status(403).json({ message: 'Usuário desativado' });
    }

    // Verifica a senha
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Senha errada' });

    // Restrição de horário de expediente para funcionários (super_admin e admin_loja são isentos)
    if (user.role === 'funcionario') {
      const acessoHorario = await HorarioPermitido.podeLogarAgora(user.id);
      if (!acessoHorario.permitido) {
        return res.status(403).json({ 
          message: acessoHorario.motivo || 'Fora do horário permitido para login' 
        });
      }
    }

    // Busca os menus habilitados para o usuário logado
    const menus = await Menu.listarHabilitadosPorUsuario(user.id);
    const menusChaves = menus.map(m => m.chave);

    // Gera token com loja_id e role incluídos no payload
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      loja_id: user.loja_id,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        loja_id: user.loja_id
      },
      autenticado: true
    };

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' }, (err, token) => {
      if (err) throw err;
      
      res.json({
        userData: {
          id: user.id,
          fullName: user.username,
          username: user.username,
          avatar: '/src/assets/images/avatars/avatar-1.png',
          email: `${user.username}@realrevision.com`,
          role: user.role,
          loja_id: user.loja_id,
          loja_nome: user.loja_nome,
          menus: menusChaves
        },
        menus,
        menusChaves,
        accessToken: token,
        userAbilities: [
          { action: 'manage', subject: 'all' }
        ]
      });
    });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router;
