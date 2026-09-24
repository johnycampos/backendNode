/**
 * Migration: add_audit_log
 * 
 * Cria a tabela audit_log para registro de ações sensíveis no sistema
 * (login, criação de usuário, criação de venda, ajuste de estoque).
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      loja_id INTEGER REFERENCES lojas(id) ON DELETE SET NULL,
      acao VARCHAR(100) NOT NULL,
      entidade VARCHAR(100),
      entidade_id INTEGER,
      detalhes JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_loja_created ON audit_log(loja_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_usuario_created ON audit_log(usuario_id, created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS audit_log CASCADE;
  `);
};
