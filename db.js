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

const createFabricantesTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS fabricantes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      cnpj VARCHAR(18),
      contato VARCHAR(100),
      telefone VARCHAR(20),
      email VARCHAR(100),
      observacoes TEXT
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Tabela "fabricantes" verificada/criada com sucesso.');
  } catch (err) {
    console.error('Erro ao criar/verificar tabela "fabricantes":', err);
  }
};

const createGruposTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS grupos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Tabela "grupos" verificada/criada com sucesso.');
  } catch (err) {
    console.error('Erro ao criar/verificar tabela "grupos":', err);
  }
};

const createSubgruposTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS subgrupos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE RESTRICT,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Tabela "subgrupos" verificada/criada com sucesso.');
  } catch (err) {
    console.error('Erro ao criar/verificar tabela "subgrupos":', err);
  }
};

const createUnidadesTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS unidades (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(50) NOT NULL,
      sigla VARCHAR(10),
      descricao TEXT
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Tabela "unidades" verificada/criada com sucesso.');
  } catch (err) {
    console.error('Erro ao criar/verificar tabela "unidades":', err);
  }
};

const createLocaisEstoqueTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS locais_estoque (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      endereco TEXT
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Tabela "locais_estoque" verificada/criada com sucesso.');
  } catch (err) {
    console.error('Erro ao criar/verificar tabela "locais_estoque":', err);
  }
};

async function createItensTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS itens (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(50) UNIQUE NOT NULL,
      nome VARCHAR(255) NOT NULL,
      nome_curto VARCHAR(100),
      grupo_id INTEGER REFERENCES grupos(id),
      subgrupo_id INTEGER REFERENCES subgrupos(id),
      custo_compra DECIMAL(10,2),
      percentual_lucro DECIMAL(5,2),
      valor DECIMAL(10,2),
      preco_consumidor DECIMAL(10,2),
      preco_revenda DECIMAL(10,2),
      preco_outros DECIMAL(10,2),
      quantidade_disponivel DECIMAL(10,2) DEFAULT 0,
      lote_ideal DECIMAL(10,2),
      quantidade_minima DECIMAL(10,2),
      unidade_id INTEGER REFERENCES unidades(id),
      fabricante_id INTEGER REFERENCES fabricantes(id),
      local_estoque_id INTEGER REFERENCES locais_estoque(id),
      gaveta VARCHAR(50),
      observacoes TEXT,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ultima_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  try {
    await pool.query(query);
    console.log('Tabela de itens criada com sucesso');
  } catch (error) {
    console.error('Erro ao criar tabela de itens:', error);
  }
}

// Verifica e cria as tabelas no início
createUsersTable();
createFabricantesTable();
createGruposTable();
createSubgruposTable();
createUnidadesTable();
createLocaisEstoqueTable();
createItensTable();

module.exports = {
  pool,
  createUsersTable,
  createFabricantesTable,
  createGruposTable,
  createSubgruposTable,
  createUnidadesTable,
  createLocaisEstoqueTable,
  createItensTable
};
