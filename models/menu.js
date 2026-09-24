const { pool } = require('../db');

class Menu {
  /**
   * Lista todos os menus cadastrados no sistema
   */
  static async listarTodos() {
    const query = 'SELECT id, chave, label, ordem FROM menus ORDER BY ordem ASC, id ASC';
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Lista os menus habilitados para um determinado usuário.
   * Regras de negócio:
   * - 'super_admin' e 'admin_loja': visualizam TODOS os menus do sistema sem checagem de restrição.
   * - 'funcionario': visualiza estritamente os menus explicitamente habilitados (fail-closed).
   */
  static async listarHabilitadosPorUsuario(usuarioId) {
    const userQuery = 'SELECT id, role FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [usuarioId]);

    if (userResult.rows.length === 0) {
      return [];
    }

    const role = userResult.rows[0].role;

    // Administradores têm acesso irrestrito a todos os menus
    if (role === 'super_admin' || role === 'admin_loja') {
      return await Menu.listarTodos();
    }

    // Para funcionários: fail-closed via INNER JOIN em usuario_menus com habilitado = true
    const query = `
      SELECT m.id, m.chave, m.label, m.ordem
      FROM menus m
      INNER JOIN usuario_menus um ON m.id = um.menu_id
      WHERE um.usuario_id = $1 AND um.habilitado = true
      ORDER BY m.ordem ASC, m.id ASC
    `;
    const result = await pool.query(query, [usuarioId]);
    return result.rows;
  }

  /**
   * Atualiza as permissões de menu de um usuário de forma atômica/transacional com validação prévia.
   * @param {number} usuarioId ID do usuário alvo
   * @param {Array<number>} menuIds Lista de IDs dos menus que devem ficar habilitados
   */
  static async setDefinicao(usuarioId, menuIds = []) {
    // 1. Validação prévia de existência do usuário
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [usuarioId]);
    if (userCheck.rows.length === 0) {
      const err = new Error('Usuário não encontrado');
      err.statusCode = 404;
      throw err;
    }

    // 2. Validação prévia dos IDs de menus informados
    const ids = Array.isArray(menuIds)
      ? [...new Set(menuIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id)))]
      : [];

    if (ids.length > 0) {
      const menusCheck = await pool.query('SELECT id FROM menus WHERE id = ANY($1::int[])', [ids]);
      if (menusCheck.rows.length !== ids.length) {
        const err = new Error('Um ou mais menus informados são inválidos ou inexistentes');
        err.statusCode = 400;
        throw err;
      }
    }

    // 3. Execução atômica da atualização
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Remove permissões anteriores do usuário
      await client.query('DELETE FROM usuario_menus WHERE usuario_id = $1', [usuarioId]);

      // Insere as novas permissões habilitadas
      for (const menuId of ids) {
        const insertQuery = `
          INSERT INTO usuario_menus (usuario_id, menu_id, habilitado)
          VALUES ($1, $2, true)
        `;
        await client.query(insertQuery, [usuarioId, menuId]);
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
}

module.exports = Menu;
