/**
 * Migration: add_lojas_and_tenant
 * Criação da tabela lojas, seed inicial dos tenants (Real Revision, Nitori, Baby Real Revision),
 * vinculação de loja_id como FK NOT NULL em users, itens, locais_estoque e vendas.
 * 
 * Catálogo compartilhado:
 * fabricantes, grupos, subgrupos e unidades permanecem SEM loja_id (taxonomia global do negócio).
 * 
 * Roles suportadas em users.role:
 * - 'super_admin': Matriz (acesso a todas as lojas e visão consolidada)
 * - 'admin_loja': Gerente da loja (gestão da sua loja específica)
 * - 'funcionario': Operador da loja (acesso delimitado por permissões de menu e horário)
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Criação da tabela de lojas (tenants)
    CREATE TABLE IF NOT EXISTS lojas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      is_matriz BOOLEAN NOT NULL DEFAULT false,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Seed das 3 lojas iniciais
    INSERT INTO lojas (nome, is_matriz, ativo)
    VALUES 
      ('Real Revision', true, true),
      ('Nitori', false, true),
      ('Baby Real Revision', false, true)
    ON CONFLICT DO NOTHING;

    -- 3. Adicionar coluna loja_id em users, itens e locais_estoque
    ALTER TABLE users ADD COLUMN IF NOT EXISTS loja_id INTEGER REFERENCES lojas(id);
    ALTER TABLE itens ADD COLUMN IF NOT EXISTS loja_id INTEGER REFERENCES lojas(id);
    ALTER TABLE locais_estoque ADD COLUMN IF NOT EXISTS loja_id INTEGER REFERENCES lojas(id);

    -- 4. Popular registros existentes com o id da matriz (Real Revision)
    UPDATE users 
    SET loja_id = (SELECT id FROM lojas WHERE is_matriz = true LIMIT 1) 
    WHERE loja_id IS NULL;

    UPDATE itens 
    SET loja_id = (SELECT id FROM lojas WHERE is_matriz = true LIMIT 1) 
    WHERE loja_id IS NULL;

    UPDATE locais_estoque 
    SET loja_id = (SELECT id FROM lojas WHERE is_matriz = true LIMIT 1) 
    WHERE loja_id IS NULL;

    UPDATE vendas 
    SET loja_id = (SELECT id FROM lojas WHERE is_matriz = true LIMIT 1) 
    WHERE loja_id IS NULL;

    -- 5. Foreign Key na tabela vendas
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendas_loja'
      ) THEN
        ALTER TABLE vendas ADD CONSTRAINT fk_vendas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);
      END IF;
    END $$;

    -- 6. Garantir constraint NOT NULL
    ALTER TABLE users ALTER COLUMN loja_id SET NOT NULL;
    ALTER TABLE itens ALTER COLUMN loja_id SET NOT NULL;
    ALTER TABLE locais_estoque ALTER COLUMN loja_id SET NOT NULL;
    ALTER TABLE vendas ALTER COLUMN loja_id SET NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE vendas DROP CONSTRAINT IF EXISTS fk_vendas_loja;
    ALTER TABLE locais_estoque DROP COLUMN IF EXISTS loja_id;
    ALTER TABLE itens DROP COLUMN IF EXISTS loja_id;
    ALTER TABLE users DROP COLUMN IF EXISTS loja_id;
    DROP TABLE IF EXISTS lojas CASCADE;
  `);
};
