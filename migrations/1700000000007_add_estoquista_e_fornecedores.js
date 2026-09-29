/**
 * Migration: add_estoquista_e_fornecedores
 *
 * 1. Adiciona coluna booleana 'estoquista' na tabela 'users' (default false)
 * 2. Cria tabela global 'fornecedores' (catálogo compartilhado sem loja_id)
 * 3. Cria tabela de relacionamento N:N 'item_fornecedores'
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS estoquista BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS fornecedores (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(50),
      nome VARCHAR(150) NOT NULL,
      cnpj VARCHAR(20),
      fone VARCHAR(20),
      cidade VARCHAR(100),
      uf CHAR(2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS item_fornecedores (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
      fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_id, fornecedor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_item_fornecedores_item ON item_fornecedores(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_fornecedores_fornecedor ON item_fornecedores(fornecedor_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS item_fornecedores CASCADE;
    DROP TABLE IF EXISTS fornecedores CASCADE;
    ALTER TABLE users DROP COLUMN IF EXISTS estoquista;
  `);
};
