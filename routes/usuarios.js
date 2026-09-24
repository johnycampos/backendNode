const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Usuario = require('../models/usuario');
const Loja = require('../models/loja');
const Menu = require('../models/menu');
const HorarioPermitido = require('../models/horarioPermitido');
const authMiddleware = require('../middleware/auth');
const apenasAdmin = require('../middleware/apenasAdmin');

// Todas as rotas de usuários requerem autenticação e privilégio de administrador
router.use(authMiddleware);
router.use(apenasAdmin);

// Listar usuários
router.get('/', async (req, res) => {
  try {
    let usuarios;
    if (req.role === 'super_admin') {
      if (req.query.loja_id) {
        usuarios = await Usuario.listarPorLoja(parseInt(req.query.loja_id, 10));
      } else {
        usuarios = await Usuario.listarTodos();
      }
    } else {
      // admin_loja vê apenas usuários da sua respectiva loja
      usuarios = await Usuario.listarPorLoja(req.lojaId);
    }

    res.json(usuarios);
  } catch (err) {
    console.error('Erro ao listar usuários:', err.message);
    res.status(500).json({ error: 'Erro no servidor ao listar usuários' });
  }
});

// Buscar usuário por ID (com menus e horários)
router.get('/:id', async (req, res) => {
  try {
    const usuario = await Usuario.buscarPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Se for admin_loja, valida se o usuário pertence à mesma loja
    if (req.role === 'admin_loja' && usuario.loja_id !== req.lojaId) {
      return res.status(403).json({ error: 'Acesso negado aos dados deste usuário' });
    }

    const menus = await Menu.listarHabilitadosPorUsuario(usuario.id);
    const horarios = await HorarioPermitido.listarPorUsuario(usuario.id);

    res.json({
      ...usuario,
      menus,
      menusIds: menus.map(m => m.id),
      horarios
    });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err.message);
    res.status(500).json({ error: 'Erro no servidor ao buscar usuário' });
  }
});

// Criar novo usuário / funcionário
router.post('/', async (req, res) => {
  try {
    const { username, password, menus, horarios, ativo } = req.body;
    let { role, loja_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }

    // Validações e restrições por papel
    if (req.role === 'admin_loja') {
      loja_id = req.lojaId; // força a loja do admin
      if (role === 'super_admin') {
        return res.status(403).json({ error: 'Admin de loja não pode criar super_admin' });
      }
      role = role || 'funcionario';
    } else {
      // super_admin
      role = role || 'funcionario';
      if (loja_id) {
        const lojaValida = await Loja.buscarPorId(loja_id);
        if (!lojaValida || !lojaValida.ativo) {
          return res.status(400).json({ error: 'Loja informada não existe ou está inativa' });
        }
      } else {
        const matriz = await Loja.buscarMatriz();
        if (!matriz) {
          return res.status(400).json({ error: 'Nenhuma loja matriz encontrada no sistema' });
        }
        loja_id = matriz.id;
      }
    }

    // Valida duplicidade de username
    const usuarioExistente = await Usuario.buscarPorUsername(username);
    if (usuarioExistente) {
      return res.status(400).json({ error: 'Username já está em uso' });
    }

    // Cria o usuário com senha hasheada
    const hashedPassword = await bcrypt.hash(password, 10);
    const novoUsuario = await Usuario.criar({
      username,
      password: hashedPassword,
      role,
      loja_id,
      ativo: ativo !== undefined ? ativo : true
    });

    // Associa menus se fornecidos
    if (Array.isArray(menus) && menus.length > 0) {
      await Menu.setDefinicao(novoUsuario.id, menus);
    }

    // Associa horários permitidos se fornecidos
    if (Array.isArray(horarios) && horarios.length > 0) {
      await HorarioPermitido.definirParaUsuario(novoUsuario.id, horarios);
    }

    res.status(201).json({
      message: 'Usuário cadastrado com sucesso',
      usuario: novoUsuario
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao criar usuário' });
  }
});

// Atualizar usuário
router.put('/:id', async (req, res) => {
  try {
    const usuarioAlvo = await Usuario.buscarPorId(req.params.id);
    if (!usuarioAlvo) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Restrições para admin_loja
    if (req.role === 'admin_loja') {
      if (usuarioAlvo.loja_id !== req.lojaId) {
        return res.status(403).json({ error: 'Você não tem permissão para alterar usuários de outra loja' });
      }
      if (usuarioAlvo.role === 'super_admin') {
        return res.status(403).json({ error: 'Você não tem permissão para alterar um super_admin' });
      }
      if (req.body.role === 'super_admin') {
        return res.status(403).json({ error: 'Não é permitido promover usuário a super_admin' });
      }
      delete req.body.loja_id; // admin_loja não pode trocar a loja do usuário
    }

    const dadosAtualizar = {};
    if (req.body.username !== undefined) dadosAtualizar.username = req.body.username;
    if (req.body.role !== undefined) dadosAtualizar.role = req.body.role;
    if (req.body.ativo !== undefined) dadosAtualizar.ativo = req.body.ativo;
    if (req.body.loja_id !== undefined && req.role === 'super_admin') {
      const lojaValida = await Loja.buscarPorId(req.body.loja_id);
      if (!lojaValida || !lojaValida.ativo) {
        return res.status(400).json({ error: 'Loja informada não existe ou está inativa' });
      }
      dadosAtualizar.loja_id = req.body.loja_id;
    }

    if (req.body.password && req.body.password.trim() !== '') {
      dadosAtualizar.password = await bcrypt.hash(req.body.password, 10);
    }

    const usuarioAtualizado = await Usuario.atualizar(usuarioAlvo.id, dadosAtualizar);

    // Se menus forem enviados no payload do update
    if (Array.isArray(req.body.menus)) {
      await Menu.setDefinicao(usuarioAlvo.id, req.body.menus);
    }

    // Se horários forem enviados no payload do update
    if (Array.isArray(req.body.horarios)) {
      await HorarioPermitido.definirParaUsuario(usuarioAlvo.id, req.body.horarios);
    }

    res.json({
      message: 'Usuário atualizado com sucesso',
      usuario: usuarioAtualizado
    });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao atualizar usuário' });
  }
});

// Listar menus habilitados de um usuário
router.get('/:id/menus', async (req, res) => {
  try {
    const usuario = await Usuario.buscarPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (req.role === 'admin_loja' && usuario.loja_id !== req.lojaId) {
      return res.status(403).json({ error: 'Acesso negado aos menus deste usuário' });
    }

    const menus = await Menu.listarHabilitadosPorUsuario(usuario.id);
    res.json(menus);
  } catch (err) {
    console.error('Erro ao buscar menus do usuário:', err.message);
    res.status(500).json({ error: 'Erro ao buscar menus do usuário' });
  }
});

// Definir menus habilitados de um usuário
router.put('/:id/menus', async (req, res) => {
  try {
    const usuario = await Usuario.buscarPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (req.role === 'admin_loja' && usuario.loja_id !== req.lojaId) {
      return res.status(403).json({ error: 'Acesso negado para alterar menus deste usuário' });
    }

    const { menus } = req.body;
    await Menu.setDefinicao(usuario.id, menus || []);

    res.json({ message: 'Permissões de menu atualizadas com sucesso' });
  } catch (err) {
    console.error('Erro ao definir menus:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao definir menus' });
  }
});

// Listar horários permitidos de um usuário
router.get('/:id/horarios', async (req, res) => {
  try {
    const usuario = await Usuario.buscarPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (req.role === 'admin_loja' && usuario.loja_id !== req.lojaId) {
      return res.status(403).json({ error: 'Acesso negado aos horários deste usuário' });
    }

    const horarios = await HorarioPermitido.listarPorUsuario(usuario.id);
    res.json(horarios);
  } catch (err) {
    console.error('Erro ao buscar horários do usuário:', err.message);
    res.status(500).json({ error: 'Erro ao buscar horários do usuário' });
  }
});

// Definir horários permitidos de um usuário
router.put('/:id/horarios', async (req, res) => {
  try {
    const usuario = await Usuario.buscarPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (req.role === 'admin_loja' && usuario.loja_id !== req.lojaId) {
      return res.status(403).json({ error: 'Acesso negado para alterar horários deste usuário' });
    }

    const { horarios } = req.body;
    await HorarioPermitido.definirParaUsuario(usuario.id, horarios || []);

    res.json({ message: 'Horários permitidos atualizados com sucesso' });
  } catch (err) {
    console.error('Erro ao definir horários:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao definir horários' });
  }
});

module.exports = router;
