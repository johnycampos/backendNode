/**
 * Migration: add_emprestimos_pecas
 * 
 * 1. Alteração de Unicidade em itens.codigo:
 *    Originalmente (1700000000000_baseline.js), itens.codigo possuía constraint UNIQUE global.
 *    Para permitir o mesmo código de peça em catálogos de lojas diferentes (ex: matriz e filiais
 *    compartilhando o mesmo código de fabricante/peça com estoques independentes),
 *    a constraint UNIQUE global antiga é removida e substituída por uma constraint composta
 *    UNIQUE (codigo, loja_id).
 * 
 * 2. Criação da Tabela emprestimos_pecas:
 *    Permite a solicitação, aprovação, rejeição e controle financeiro (pago/não pago)
 *    de transferência de peças por empréstimo entre diferentes lojas do sistema.
 * 
 * 3. Seed do menu 'emprestimos' na tabela menus.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Remove constraint UNIQUE global anterior em itens.codigo
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'itens'::regclass 
          AND contype = 'u' 
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'itens'::regclass AND attname = 'codigo')]
      ) LOOP
        EXECUTE 'ALTER TABLE itens DROP CONSTRAINT ' || quote_ident(r.conname);
      END LOOP;
    END $$;

    ALTER TABLE itens DROP CONSTRAINT IF EXISTS itens_codigo_key;

    -- 2. Adiciona constraint UNIQUE composta (codigo, loja_id)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itens_codigo_loja_id_key'
      ) THEN
        ALTER TABLE itens ADD CONSTRAINT itens_codigo_loja_id_key UNIQUE (codigo, loja_id);
      END IF;
    END $$;

    -- 3. Criação da tabela emprestimos_pecas
    CREATE TABLE IF NOT EXISTS emprestimos_pecas (
      id SERIAL PRIMARY KEY,
      item_origem_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE RESTRICT,
      item_destino_id INTEGER REFERENCES itens(id) ON DELETE SET NULL,
      codigo_item VARCHAR(50) NOT NULL,
      nome_item VARCHAR(255) NOT NULL,
      loja_origem_id INTEGER NOT NULL REFERENCES lojas(id),
      loja_destino_id INTEGER NOT NULL REFERENCES lojas(id),
      quantidade DECIMAL(10,2) NOT NULL CHECK (quantidade > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'aprovado', 'rejeitado')),
      solicitante_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aprovador_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      pago BOOLEAN NOT NULL DEFAULT false,
      forma_pagamento VARCHAR(50),
      data_pagamento TIMESTAMP,
      registrado_pagamento_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
      observacoes TEXT,
      motivo_rejeicao TEXT,
      data_solicitacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_resposta TIMESTAMP,
      CHECK (loja_origem_id <> loja_destino_id)
    );

    -- 4. Índices para performance em emprestimos_pecas
    CREATE INDEX IF NOT EXISTS idx_emprestimos_loja_origem ON emprestimos_pecas(loja_origem_id);
    CREATE INDEX IF NOT EXISTS idx_emprestimos_loja_destino ON emprestimos_pecas(loja_destino_id);
    CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos_pecas(status);
    CREATE INDEX IF NOT EXISTS idx_emprestimos_item_destino ON emprestimos_pecas(item_destino_id);

    -- 5. Seed do novo menu no sistema
    INSERT INTO menus (chave, label, ordem)
    VALUES ('emprestimos', 'Empréstimos', 7)
    ON CONFLICT (chave) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- 1. Remove o menu emprestimos
    DELETE FROM menus WHERE chave = 'emprestimos';

    -- 2. Remove a tabela emprestimos_pecas
    DROP TABLE IF EXISTS emprestimos_pecas CASCADE;

    -- 3. Reverte a constraint de itens para UNIQUE(codigo) simples
    -- NOTA: Isso pode falhar se já houver itens com códigos idênticos em lojas diferentes no banco.
    ALTER TABLE itens DROP CONSTRAINT IF EXISTS itens_codigo_loja_id_key;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itens_codigo_key'
      ) THEN
        ALTER TABLE itens ADD CONSTRAINT itens_codigo_key UNIQUE (codigo);
      END IF;
    END $$;
  `);
};
