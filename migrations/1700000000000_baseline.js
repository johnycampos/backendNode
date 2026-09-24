/**
 * Migration de Baseline - Schema original completo
 * Criação idempotente de todas as tabelas pré-existentes no sistema:
 * users, fabricantes, grupos, subgrupos, unidades, locais_estoque, itens, vendas, itens_venda
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(100) NOT NULL,
      role VARCHAR(100) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fabricantes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      cnpj VARCHAR(18),
      contato VARCHAR(100),
      telefone VARCHAR(20),
      email VARCHAR(100),
      observacoes TEXT
    );

    CREATE TABLE IF NOT EXISTS grupos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subgrupos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE RESTRICT,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS unidades (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(50) NOT NULL,
      sigla VARCHAR(10),
      descricao TEXT
    );

    CREATE TABLE IF NOT EXISTS locais_estoque (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      endereco TEXT
    );

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
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id SERIAL PRIMARY KEY,
      valor_total DECIMAL(10,2) NOT NULL,
      forma_pagamento VARCHAR(50) NOT NULL,
      parcelas INTEGER,
      observacoes TEXT,
      loja_id INTEGER NOT NULL,
      vendedor_id INTEGER REFERENCES users(id),
      data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS itens_venda (
      id SERIAL PRIMARY KEY,
      venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE RESTRICT,
      quantidade DECIMAL(10,2) NOT NULL,
      preco_unitario DECIMAL(10,2) NOT NULL,
      valor_total_item DECIMAL(10,2) NOT NULL
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS itens_venda CASCADE;
    DROP TABLE IF EXISTS vendas CASCADE;
    DROP TABLE IF EXISTS itens CASCADE;
    DROP TABLE IF EXISTS locais_estoque CASCADE;
    DROP TABLE IF EXISTS unidades CASCADE;
    DROP TABLE IF EXISTS subgrupos CASCADE;
    DROP TABLE IF EXISTS grupos CASCADE;
    DROP TABLE IF EXISTS fabricantes CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
};
