const express = require('express');
const cors = require('cors'); // Importe o cors
const { Pool } = require('pg');
const { createUsersTable } = require('./db');
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

// Verifica e cria tabela no início
createUsersTable();

// Routes
app.use('/api/auth', require('./routes/auth'));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
