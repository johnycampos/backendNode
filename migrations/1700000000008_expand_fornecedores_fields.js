/**
 * Migration: expand_fornecedores_fields
 *
 * 1. Amplia a tabela global 'fornecedores' com campos adicionais mapeados do Access:
 *    - fantasia (VARCHAR 100)
 *    - ie_rg (VARCHAR 25)
 *    - endereco (VARCHAR 150)
 *    - bairro (VARCHAR 100)
 *    - cep (VARCHAR 12)
 *    - fax (VARCHAR 20)
 *    - email (VARCHAR 254)
 *    - contato (VARCHAR 254)
 *    - site (VARCHAR 100)
 *    - obs (TEXT)
 *    - transportadora (BOOLEAN DEFAULT false)
 *    - ultima_compra (TIMESTAMP)
 *    - cadastrado (TIMESTAMP - data de cadastro original no Access)
 *
 * 2. Amplia a precisão de itens.percentual_lucro:
 *    Originalmente DECIMAL(5,2) (máx 999.99), alterada para DECIMAL(10,2) para suportar
 *    itens com margens históricas elevadas vindas do Access (ex: lucro >= 1000%),
 *    evitando erro de numeric field overflow e preservando o dado histórico real.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Ampliação da tabela fornecedores
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS fantasia VARCHAR(100);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS ie_rg VARCHAR(25);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS endereco VARCHAR(150);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS cep VARCHAR(12);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS fax VARCHAR(20);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS contato VARCHAR(254);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS site VARCHAR(100);
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS obs TEXT;
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS transportadora BOOLEAN DEFAULT false;
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS ultima_compra TIMESTAMP;
    ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS cadastrado TIMESTAMP;

    -- 2. Ampliação de precisão de itens.percentual_lucro
    ALTER TABLE itens ALTER COLUMN percentual_lucro TYPE DECIMAL(10,2);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Reverter precisão de itens.percentual_lucro (pode falhar se houver valores >= 1000)
    ALTER TABLE itens ALTER COLUMN percentual_lucro TYPE DECIMAL(5,2);

    -- Remover colunas adicionadas em fornecedores
    ALTER TABLE fornecedores
      DROP COLUMN IF EXISTS fantasia,
      DROP COLUMN IF EXISTS ie_rg,
      DROP COLUMN IF EXISTS endereco,
      DROP COLUMN IF EXISTS bairro,
      DROP COLUMN IF EXISTS cep,
      DROP COLUMN IF EXISTS fax,
      DROP COLUMN IF EXISTS email,
      DROP COLUMN IF EXISTS contato,
      DROP COLUMN IF EXISTS site,
      DROP COLUMN IF EXISTS obs,
      DROP COLUMN IF EXISTS transportadora,
      DROP COLUMN IF EXISTS ultima_compra,
      DROP COLUMN IF EXISTS cadastrado;
  `);
};
