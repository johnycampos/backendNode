/**
 * Migration: add_menus_and_permissions
 * 
 * Criação da tabela de menus do sistema e da tabela associativa usuario_menus
 * para controle granular de permissões de acesso por funcionário.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Tabela de Menus
    CREATE TABLE IF NOT EXISTS menus (
      id SERIAL PRIMARY KEY,
      chave VARCHAR(50) UNIQUE NOT NULL,
      label VARCHAR(100) NOT NULL,
      ordem INTEGER DEFAULT 0
    );

    -- 2. Seed inicial dos menus do sistema
    INSERT INTO menus (chave, label, ordem)
    VALUES
      ('dashboard', 'Dashboard', 1),
      ('estoque', 'Estoque', 2),
      ('vendas', 'Vendas/PDV', 3),
      ('usuarios', 'Usuários', 4),
      ('configuracoes', 'Configurações', 5),
      ('relatorios', 'Relatórios', 6)
    ON CONFLICT (chave) DO NOTHING;

    -- 3. Tabela de permissões de menu por usuário
    CREATE TABLE IF NOT EXISTS usuario_menus (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
      habilitado BOOLEAN NOT NULL DEFAULT true,
      UNIQUE(usuario_id, menu_id)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS usuario_menus CASCADE;
    DROP TABLE IF EXISTS menus CASCADE;
  `);
};
