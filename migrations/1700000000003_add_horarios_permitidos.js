/**
 * Migration: add_horarios_permitidos
 * 
 * Criação da tabela horarios_permitidos e índice para controle de expediente
 * e validação de horário permitido de login para funcionários.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Tabela de horários permitidos por usuário
    CREATE TABLE IF NOT EXISTS horarios_permitidos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      hora_inicio TIME NOT NULL,
      hora_fim TIME NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      CHECK (hora_inicio < hora_fim)
    );

    -- 2. Índice composto para otimização de consulta de login
    CREATE INDEX IF NOT EXISTS idx_horarios_permitidos_usuario_dia 
      ON horarios_permitidos (usuario_id, dia_semana);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS horarios_permitidos CASCADE;
  `);
};
