const { Pool } = require('pg');
require('dotenv').config(); // Certifique-se de carregar as variáveis de ambiente

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const createUsersTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(100) NOT NULL,
      role VARCHAR(100) NOT NULL
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Tabela "users" verificada/criada com sucesso.');
  } catch (err) {
    console.error('Erro ao criar/verificar tabela "users":', err);
  }
};

module.exports = {
  pool,
  createUsersTable
};
