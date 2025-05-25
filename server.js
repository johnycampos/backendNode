const express = require('express');
const cors = require('cors'); // Importe o cors
const { Pool } = require('pg');
const { createUsersTable, createFabricantesTable, createGruposTable, createSubgruposTable, createUnidadesTable, createLocaisEstoqueTable, createItensTable } = require('./db');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());

// Configuração do CORS
app.use(cors());

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Verifica e cria tabelas no início
createUsersTable();
createFabricantesTable();
createGruposTable();
createSubgruposTable();
createUnidadesTable();
createLocaisEstoqueTable();
createItensTable();

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API está online!',
    timestamp: new Date().toISOString(),
    status: 'success'
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/fabricantes', require('./routes/fabricantes'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/subgrupos', require('./routes/subgrupos'));
app.use('/api/unidades', require('./routes/unidades'));
app.use('/api/locais-estoque', require('./routes/locaisEstoque'));
app.use('/api/itens', require('./routes/itemRoutes'));
app.use('/api/vendas', require('./routes/vendaRoutes'));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
