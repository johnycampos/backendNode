const { pool } = require('../db');

class AuditLog {
  /**
   * Registra uma ação de auditoria de forma assíncrona (fire-and-forget).
   * Nunca lança erro para não interromper a operação de negócio do chamador.
   */
  static async registrar(param1, param2, param3, param4, param5, param6) {
    try {
      let usuarioId, lojaId, acao, entidade, entidadeId, detalhes;

      if (typeof param1 === 'object' && param1 !== null && !Array.isArray(param1)) {
        usuarioId = param1.usuarioId || param1.usuario_id || null;
        lojaId = param1.lojaId || param1.loja_id || null;
        acao = param1.acao || null;
        entidade = param1.entidade || null;
        entidadeId = param1.entidadeId || param1.entidade_id || null;
        detalhes = param1.detalhes || null;
      } else {
        usuarioId = param1 || null;
        lojaId = param2 || null;
        acao = param3 || null;
        entidade = param4 || null;
        entidadeId = param5 || null;
        detalhes = param6 || null;
      }

      if (!acao) {
        console.warn('AuditLog: ação não informada, ignorando registro');
        return null;
      }

      const query = `
        INSERT INTO audit_log (
          usuario_id,
          loja_id,
          acao,
          entidade,
          entidade_id,
          detalhes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;

      const values = [
        usuarioId,
        lojaId,
        acao,
        entidade,
        entidadeId,
        detalhes ? JSON.stringify(detalhes) : null
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Erro ao registrar audit_log:', err.message);
      return null;
    }
  }

  /**
   * Lista registros de auditoria com filtros opcionais
   */
  static async listar({ lojaId = null, usuarioId = null, acao = null, limite = 50, offset = 0 } = {}) {
    try {
      let query = `
        SELECT 
          a.*,
          u.username as usuario_nome,
          l.nome as loja_nome
        FROM audit_log a
        LEFT JOIN users u ON a.usuario_id = u.id
        LEFT JOIN lojas l ON a.loja_id = l.id
        WHERE 1=1
      `;
      const values = [];
      let paramIndex = 1;

      if (lojaId) {
        query += ` AND a.loja_id = $${paramIndex++}`;
        values.push(lojaId);
      }

      if (usuarioId) {
        query += ` AND a.usuario_id = $${paramIndex++}`;
        values.push(usuarioId);
      }

      if (acao) {
        query += ` AND a.acao = $${paramIndex++}`;
        values.push(acao);
      }

      query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      values.push(limite, offset);

      const result = await pool.query(query, values);
      return result.rows;
    } catch (err) {
      console.error('Erro ao listar audit_log:', err.message);
      return [];
    }
  }
}

module.exports = AuditLog;
