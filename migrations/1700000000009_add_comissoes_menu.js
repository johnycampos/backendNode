/**
 * Migration: add_comissoes_menu
 * 
 * Adiciona o menu 'comissoes' ('Comissão do Vendedor') na tabela de menus.
 * A deleção em down remove o menu, disparando ON DELETE CASCADE em usuario_menus.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO menus (chave, label, ordem)
    VALUES ('comissoes', 'Comissão do Vendedor', 8)
    ON CONFLICT (chave) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM menus WHERE chave = 'comissoes';
  `);
};
