const { pool } = require('../db');

class HorarioPermitido {
  /**
   * Lista todos os horários cadastrados para um usuário
   */
  static async listarPorUsuario(usuarioId) {
    const query = `
      SELECT id, usuario_id, dia_semana, hora_inicio, hora_fim, ativo
      FROM horarios_permitidos
      WHERE usuario_id = $1
      ORDER BY dia_semana ASC, hora_inicio ASC
    `;
    const result = await pool.query(query, [usuarioId]);
    return result.rows;
  }

  /**
   * Substitui transacionalmente todos os horários permitidos de um usuário
   * @param {number} usuarioId ID do usuário
   * @param {Array<{dia_semana: number, hora_inicio: string, hora_fim: string, ativo?: boolean}>} horarios Lista de horários
   */
  static async definirParaUsuario(usuarioId, horarios = []) {
    // 1. Validação prévia de existência do usuário
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [usuarioId]);
    if (userCheck.rows.length === 0) {
      const err = new Error('Usuário não encontrado');
      err.statusCode = 404;
      throw err;
    }

    // 2. Validação da estrutura dos horários
    if (!Array.isArray(horarios)) {
      const err = new Error('Horários devem ser enviados como um array');
      err.statusCode = 400;
      throw err;
    }

    for (const h of horarios) {
      if (h.dia_semana === undefined || h.dia_semana === null || h.dia_semana < 0 || h.dia_semana > 6) {
        const err = new Error('Dia da semana inválido (deve ser entre 0 e 6)');
        err.statusCode = 400;
        throw err;
      }

      if (!h.hora_inicio || !h.hora_fim) {
        const err = new Error('hora_inicio e hora_fim são obrigatórias');
        err.statusCode = 400;
        throw err;
      }

      // Validação se hora_inicio < hora_fim
      if (h.hora_inicio >= h.hora_fim) {
        const err = new Error(`hora_inicio (${h.hora_inicio}) deve ser menor que hora_fim (${h.hora_fim})`);
        err.statusCode = 400;
        throw err;
      }
    }

    // 3. Execução transacional (DELETE + INSERT)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Limpa horários anteriores
      await client.query('DELETE FROM horarios_permitidos WHERE usuario_id = $1', [usuarioId]);

      // Insere os novos horários
      for (const h of horarios) {
        const ativo = h.ativo !== undefined ? h.ativo : true;
        const insertQuery = `
          INSERT INTO horarios_permitidos (usuario_id, dia_semana, hora_inicio, hora_fim, ativo)
          VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(insertQuery, [usuarioId, h.dia_semana, h.hora_inicio, h.hora_fim, ativo]);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verifica se o usuário tem permissão para logar no momento atual
   * - super_admin e admin_loja: sempre permitido.
   * - funcionario: validado contra dia_semana e hora atual do servidor (fail-closed se sem horário).
   * @param {number} usuarioId ID do usuário
   * @returns {Promise<{permitido: boolean, motivo: string|null}>}
   */
  static async podeLogarAgora(usuarioId) {
    const userQuery = 'SELECT id, role FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [usuarioId]);

    if (userResult.rows.length === 0) {
      return { permitido: false, motivo: 'Usuário não encontrado' };
    }

    const role = userResult.rows[0].role;

    // Administradores e super_admin não sofrem restrição de horário
    if (role === 'super_admin' || role === 'admin_loja') {
      return { permitido: true, motivo: null };
    }

    // Funcionário: restrição por dia e horário do servidor
    const now = new Date();
    const diaSemana = now.getDay(); // 0 (Domingo) a 6 (Sábado)
    const horas = String(now.getHours()).padStart(2, '0');
    const minutos = String(now.getMinutes()).padStart(2, '0');
    const segundos = String(now.getSeconds()).padStart(2, '0');
    const horaAtual = `${horas}:${minutos}:${segundos}`;

    // 1. Verifica se o funcionário possui horários ativos cadastrados no sistema (fail-closed)
    const horariosQuery = `
      SELECT id, dia_semana, hora_inicio, hora_fim 
      FROM horarios_permitidos 
      WHERE usuario_id = $1 AND ativo = true
    `;
    const horariosResult = await pool.query(horariosQuery, [usuarioId]);

    if (horariosResult.rows.length === 0) {
      return {
        permitido: false,
        motivo: 'Nenhum horário de expediente cadastrado para este colaborador'
      };
    }

    // 2. Verifica se há intervalo ativo válido para o momento atual
    const checkQuery = `
      SELECT id 
      FROM horarios_permitidos 
      WHERE usuario_id = $1 
        AND dia_semana = $2 
        AND ativo = true 
        AND hora_inicio <= $3 
        AND hora_fim >= $3
    `;
    const checkResult = await pool.query(checkQuery, [usuarioId, diaSemana, horaAtual]);

    if (checkResult.rows.length > 0) {
      return { permitido: true, motivo: null };
    }

    // 3. Determina o motivo específico para recusa
    const temExpedienteHoje = horariosResult.rows.some(h => h.dia_semana === diaSemana);
    if (temExpedienteHoje) {
      return {
        permitido: false,
        motivo: 'Fora do horário permitido para login'
      };
    }

    return {
      permitido: false,
      motivo: 'Não há expediente cadastrado para este colaborador no dia de hoje'
    };
  }
}

module.exports = HorarioPermitido;
