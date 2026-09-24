/**
 * Migration: add_ativo_to_users
 * 
 * Adiciona a coluna 'ativo' na tabela users para permitir desativação de usuários.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS ativo;
  `);
};
