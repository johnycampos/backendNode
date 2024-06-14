const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db'); // Importa o pool do arquivo db.js

// Registro
router.post('/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Verifica se o usuário existe
    const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      console.log('Usuário já existe');
      return res.status(400).json({ message: 'Usuário já existe' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insere usuário no banco de dados
    await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2 ,$3)', [username, hashedPassword, role]);

    res.status(201).json({ message: 'Usuário registrado com sucesso' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Verifica se o usuário existe
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) return res.status(400).json({ message: 'Login inválido' });

    // Verifica a senha
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) return res.status(400).json({ message: 'Senha errada' });


    // console.log(user)

    // Gera token 
    const payload = {
      user: {
        id: user.rows[0].id
      },
      autenticado: true
    };


    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' }, (err, token) => {
      if (err) throw err;
      
      res.json({
        userData: {
          id: user.rows[0].id,
          fullName: user.rows[0].username,
          username: 'johndoe',
          avatar: '/src/assets/images/avatars/avatar-1.png',
          email: 'admin@demo.com',
          role: user.rows[0].role,
        },
        accessToken: token,
        userAbilities: [
          {action: 'manage', subject: 'all'}
        ]
  
      });
      // res.status(200).send('Erro no servidor');

    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

module.exports = router;
