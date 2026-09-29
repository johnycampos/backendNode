const { pool } = require('../db');
const Item = require('./item');

class EmprestimoPeca {
  /**
   * Cria uma solicitação de empréstimo de peça entre lojas.
   * Valida item de origem, estoque disponível e garante que a loja solicitante
   * seja diferente da loja detentora do item.
   */
  static async criar({ itemOrigemId, quantidade, lojaDestinoId, solicitanteId, observacoes = null }) {
    if (!itemOrigemId) {
      const err = new Error('Item de origem é obrigatório');
      err.statusCode = 400;
      throw err;
    }

    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      const err = new Error('Quantidade solicitada deve ser maior que zero');
      err.statusCode = 400;
      throw err;
    }

    // Busca o item de origem para extrair a loja real e validar o estoque atual
    const itemOrigem = await Item.buscarPorId(itemOrigemId);
    if (!itemOrigem) {
      const err = new Error('Item de origem não encontrado');
      err.statusCode = 404;
      throw err;
    }

    const lojaOrigemId = itemOrigem.loja_id;
    if (Number(lojaDestinoId) === Number(lojaOrigemId)) {
      const err = new Error('Não é permitido solicitar empréstimo de item da mesma loja');
      err.statusCode = 400;
      throw err;
    }

    if (qtd > Number(itemOrigem.quantidade_disponivel)) {
      const err = new Error(`Quantidade solicitada (${qtd}) excede o estoque disponível (${itemOrigem.quantidade_disponivel}) na loja de origem`);
      err.statusCode = 400;
      throw err;
    }

    const query = `
      INSERT INTO emprestimos_pecas (
        item_origem_id,
        codigo_item,
        nome_item,
        loja_origem_id,
        loja_destino_id,
        quantidade,
        status,
        solicitante_id,
        observacoes
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'solicitado', $7, $8)
      RETURNING *
    `;

    const values = [
      itemOrigem.id,
      itemOrigem.codigo,
      itemOrigem.nome,
      lojaOrigemId,
      lojaDestinoId,
      qtd,
      solicitanteId,
      observacoes
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Lista solicitações de empréstimo conforme permissões de papel (role) e filtros.
   * - super_admin: visualiza tudo (ou filtra por loja/status)
   * - admin_loja: visualiza solicitações onde a própria loja é origem OU destino
   * - funcionario: visualiza estritamente os que solicitou (solicitante_id = seu id)
   */
  static async listar({ role, lojaId, userId, status = null, comoOrigem = false, comoDestino = false } = {}) {
    let query = `
      SELECT 
        ep.*,
        lo.nome as loja_origem_nome,
        ld.nome as loja_destino_nome,
        u_sol.username as solicitante_nome,
        u_apr.username as aprovador_nome,
        u_pag.username as registrado_pagamento_nome
      FROM emprestimos_pecas ep
      JOIN lojas lo ON ep.loja_origem_id = lo.id
      JOIN lojas ld ON ep.loja_destino_id = ld.id
      LEFT JOIN users u_sol ON ep.solicitante_id = u_sol.id
      LEFT JOIN users u_apr ON ep.aprovador_id = u_apr.id
      LEFT JOIN users u_pag ON ep.registrado_pagamento_por = u_pag.id
      WHERE 1=1
    `;
    const values = [];
    let idx = 1;

    // Escopo de visibilidade por papel
    if (role === 'super_admin') {
      if (lojaId) {
        query += ` AND (ep.loja_origem_id = $${idx} OR ep.loja_destino_id = $${idx})`;
        values.push(lojaId);
        idx++;
      }
    } else if (role === 'admin_loja') {
      if (comoOrigem) {
        query += ` AND ep.loja_origem_id = $${idx}`;
        values.push(lojaId);
        idx++;
      } else if (comoDestino) {
        query += ` AND ep.loja_destino_id = $${idx}`;
        values.push(lojaId);
        idx++;
      } else {
        query += ` AND (ep.loja_origem_id = $${idx} OR ep.loja_destino_id = $${idx})`;
        values.push(lojaId);
        idx++;
      }
    } else {
      // funcionario
      query += ` AND ep.solicitante_id = $${idx}`;
      values.push(userId);
      idx++;
    }

    if (status) {
      query += ` AND ep.status = $${idx}`;
      values.push(status);
      idx++;
    }

    query += ` ORDER BY ep.data_solicitacao DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Busca um registro de empréstimo por ID completo com relacionamentos.
   */
  static async buscarPorId(id) {
    const query = `
      SELECT 
        ep.*,
        lo.nome as loja_origem_nome,
        ld.nome as loja_destino_nome,
        u_sol.username as solicitante_nome,
        u_apr.username as aprovador_nome,
        u_pag.username as registrado_pagamento_nome
      FROM emprestimos_pecas ep
      JOIN lojas lo ON ep.loja_origem_id = lo.id
      JOIN lojas ld ON ep.loja_destino_id = ld.id
      LEFT JOIN users u_sol ON ep.solicitante_id = u_sol.id
      LEFT JOIN users u_apr ON ep.aprovador_id = u_apr.id
      LEFT JOIN users u_pag ON ep.registrado_pagamento_por = u_pag.id
      WHERE ep.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Aprova um empréstimo de forma TRANSACIONAL:
   * 1. Bloqueia o registro do empréstimo (FOR UPDATE)
   * 2. Valida autorização: quem aprova DEVE ser super_admin ou admin_loja da loja_origem_id
   * 3. Re-valida estoque do item de origem com lock
   * 4. Decrementa o estoque do item de origem
   * 5. Localiza ou cria o item no catálogo da loja de destino com o mesmo código
   * 6. Atualiza o status para 'aprovado' e vincula item_destino_id
   */
  static async aprovar({ id, aprovadorId, lojaAdmin, roleAdmin }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Busca o empréstimo com lock
      const empRes = await client.query('SELECT * FROM emprestimos_pecas WHERE id = $1 FOR UPDATE', [id]);
      const emprestimo = empRes.rows[0];

      if (!emprestimo) {
        const err = new Error('Empréstimo não encontrado');
        err.statusCode = 404;
        throw err;
      }

      if (emprestimo.status !== 'solicitado') {
        const err = new Error(`Apenas empréstimos em status 'solicitado' podem ser aprovados (status atual: ${emprestimo.status})`);
        err.statusCode = 400;
        throw err;
      }

      // 2. Validação de autorização: A loja detentora do estoque (origem) é quem autoriza a saída
      if (roleAdmin !== 'super_admin' && Number(lojaAdmin) !== Number(emprestimo.loja_origem_id)) {
        const err = new Error('Apenas o administrador da loja de origem (ou super_admin) pode aprovar a saída de peças do seu estoque');
        err.statusCode = 403;
        throw err;
      }

      const qtdEmprestada = Number(emprestimo.quantidade);

      // 3. Busca o item de origem com lock
      const itemOrigRes = await client.query('SELECT * FROM itens WHERE id = $1 FOR UPDATE', [emprestimo.item_origem_id]);
      const itemOrigem = itemOrigRes.rows[0];

      if (!itemOrigem) {
        const err = new Error('Item de origem não encontrado no catálogo');
        err.statusCode = 404;
        throw err;
      }

      const estoqueAtual = Number(itemOrigem.quantidade_disponivel);
      if (estoqueAtual < qtdEmprestada) {
        const err = new Error(`Estoque insuficiente na loja de origem: disponível ${estoqueAtual}, solicitado ${qtdEmprestada}`);
        err.statusCode = 400;
        throw err;
      }

      // 4. Decrementa estoque do item de origem
      await client.query(
        'UPDATE itens SET quantidade_disponivel = quantidade_disponivel - $1, ultima_atualizacao = CURRENT_TIMESTAMP WHERE id = $2',
        [qtdEmprestada, itemOrigem.id]
      );

      // 5. Localiza ou cria item na loja de destino com o mesmo código
      const itemDestinoRes = await client.query(
        'SELECT * FROM itens WHERE codigo = $1 AND loja_id = $2 FOR UPDATE',
        [emprestimo.codigo_item, emprestimo.loja_destino_id]
      );

      let itemDestinoId;

      if (itemDestinoRes.rows.length > 0) {
        // Já existe um item com esse código na loja de destino: incrementa o estoque
        const itemDestinoExistente = itemDestinoRes.rows[0];
        await client.query(
          'UPDATE itens SET quantidade_disponivel = quantidade_disponivel + $1, ultima_atualizacao = CURRENT_TIMESTAMP WHERE id = $2',
          [qtdEmprestada, itemDestinoExistente.id]
        );
        itemDestinoId = itemDestinoExistente.id;
      } else {
        // Não existe: cria um novo registro em itens copiando os dados de catálogo do item de origem
        const insertItemQuery = `
          INSERT INTO itens (
            codigo,
            nome,
            nome_curto,
            grupo_id,
            subgrupo_id,
            custo_compra,
            percentual_lucro,
            valor,
            preco_consumidor,
            preco_revenda,
            preco_outros,
            quantidade_disponivel,
            lote_ideal,
            quantidade_minima,
            unidade_id,
            fabricante_id,
            observacoes,
            loja_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING id
        `;

        const insertValues = [
          emprestimo.codigo_item,
          itemOrigem.nome,
          itemOrigem.nome_curto,
          itemOrigem.grupo_id,
          itemOrigem.subgrupo_id,
          itemOrigem.custo_compra,
          itemOrigem.percentual_lucro,
          itemOrigem.valor,
          itemOrigem.preco_consumidor,
          itemOrigem.preco_revenda,
          itemOrigem.preco_outros,
          qtdEmprestada,
          itemOrigem.lote_ideal,
          itemOrigem.quantidade_minima,
          itemOrigem.unidade_id,
          itemOrigem.fabricante_id,
          itemOrigem.observacoes ? `[Empréstimo de Loja] ${itemOrigem.observacoes}` : '[Empréstimo entre Lojas]',
          emprestimo.loja_destino_id
        ];

        const novoItemRes = await client.query(insertItemQuery, insertValues);
        itemDestinoId = novoItemRes.rows[0].id;
      }

      // 6. Atualiza o registro de empréstimo para 'aprovado'
      const updateEmpQuery = `
        UPDATE emprestimos_pecas
        SET 
          item_destino_id = $1,
          status = 'aprovado',
          aprovador_id = $2,
          data_resposta = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      const finalRes = await client.query(updateEmpQuery, [itemDestinoId, aprovadorId, id]);

      await client.query('COMMIT');
      return finalRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Rejeita um empréstimo em status 'solicitado'.
   * Apenas super_admin ou admin da loja de origem pode rejeitar.
   */
  static async rejeitar({ id, aprovadorId, motivo = null, lojaAdmin, roleAdmin }) {
    const emprestimo = await this.buscarPorId(id);
    if (!emprestimo) {
      const err = new Error('Empréstimo não encontrado');
      err.statusCode = 404;
      throw err;
    }

    if (emprestimo.status !== 'solicitado') {
      const err = new Error(`Apenas empréstimos em status 'solicitado' podem ser rejeitados (status atual: ${emprestimo.status})`);
      err.statusCode = 400;
      throw err;
    }

    if (roleAdmin !== 'super_admin' && Number(lojaAdmin) !== Number(emprestimo.loja_origem_id)) {
      const err = new Error('Apenas o administrador da loja de origem (ou super_admin) pode rejeitar o empréstimo');
      err.statusCode = 403;
      throw err;
    }

    const query = `
      UPDATE emprestimos_pecas
      SET 
        status = 'rejeitado',
        aprovador_id = $1,
        motivo_rejeicao = $2,
        data_resposta = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [aprovadorId, motivo, id]);
    return result.rows[0];
  }

  /**
   * Registra o pagamento de um empréstimo aprovado.
   */
  static async registrarPagamento({ id, formaPagamento, registradoPor, lojaAdmin, roleAdmin }) {
    if (!formaPagamento || String(formaPagamento).trim() === '') {
      const err = new Error('Forma de pagamento é obrigatória');
      err.statusCode = 400;
      throw err;
    }

    const emprestimo = await this.buscarPorId(id);
    if (!emprestimo) {
      const err = new Error('Empréstimo não encontrado');
      err.statusCode = 404;
      throw err;
    }

    if (emprestimo.status !== 'aprovado') {
      const err = new Error('Apenas empréstimos com status "aprovado" podem receber registro de pagamento');
      err.statusCode = 400;
      throw err;
    }

    if (emprestimo.pago) {
      const err = new Error('O pagamento deste empréstimo já foi registrado anteriormente');
      err.statusCode = 400;
      throw err;
    }

    // Apenas admins das lojas envolvidas ou super_admin
    if (
      roleAdmin !== 'super_admin' &&
      Number(lojaAdmin) !== Number(emprestimo.loja_origem_id) &&
      Number(lojaAdmin) !== Number(emprestimo.loja_destino_id)
    ) {
      const err = new Error('Apenas administradores das lojas envolvidas podem registrar pagamento');
      err.statusCode = 403;
      throw err;
    }

    const query = `
      UPDATE emprestimos_pecas
      SET 
        pago = true,
        forma_pagamento = $1,
        data_pagamento = CURRENT_TIMESTAMP,
        registrado_pagamento_por = $2
      WHERE id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [formaPagamento.trim(), registradoPor, id]);
    return result.rows[0];
  }

  /**
   * Consulta estoque disponível de outras lojas (todas exceto a lojaId do solicitante).
   * Filtra apenas itens com quantidade_disponivel > 0.
   */
  static async buscarEstoqueOutrasLojas({ lojaId, busca = null } = {}) {
    let query = `
      SELECT 
        i.id,
        i.codigo,
        i.nome,
        i.nome_curto,
        i.quantidade_disponivel,
        i.valor,
        i.preco_consumidor,
        i.loja_id,
        l.nome as loja_nome,
        g.nome as grupo_nome,
        u.sigla as unidade_sigla
      FROM itens i
      JOIN lojas l ON i.loja_id = l.id
      LEFT JOIN grupos g ON i.grupo_id = g.id
      LEFT JOIN unidades u ON i.unidade_id = u.id
      WHERE i.quantidade_disponivel > 0
    `;
    const values = [];
    let idx = 1;

    if (lojaId) {
      query += ` AND i.loja_id <> $${idx}`;
      values.push(lojaId);
      idx++;
    }

    if (busca && busca.trim() !== '') {
      query += ` AND (i.codigo ILIKE $${idx} OR i.nome ILIKE $${idx} OR i.nome_curto ILIKE $${idx})`;
      values.push(`%${busca.trim()}%`);
      idx++;
    }

    query += ` ORDER BY i.nome ASC, l.nome ASC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Localiza se um determinado item é oriundo de um empréstimo aprovado.
   */
  static async buscarPorItemDestino(itemId) {
    const query = `
      SELECT 
        ep.*,
        lo.nome as loja_origem_nome,
        ld.nome as loja_destino_nome
      FROM emprestimos_pecas ep
      JOIN lojas lo ON ep.loja_origem_id = lo.id
      JOIN lojas ld ON ep.loja_destino_id = ld.id
      WHERE ep.item_destino_id = $1 AND ep.status = 'aprovado'
      ORDER BY ep.data_resposta DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [itemId]);
    return result.rows[0] || null;
  }

  /**
   * Lista todos os empréstimos aprovados para itens recebidos na loja (para enriquecer lista de estoque).
   */
  static async listarItensEmprestadosRecebidos(lojaId = null) {
    let query = `
      SELECT 
        ep.id as emprestimo_id,
        ep.item_destino_id,
        ep.quantidade as quantidade_emprestada,
        ep.pago,
        ep.forma_pagamento,
        lo.nome as loja_origem_nome,
        ep.data_resposta
      FROM emprestimos_pecas ep
      JOIN lojas lo ON ep.loja_origem_id = lo.id
      WHERE ep.status = 'aprovado' AND ep.item_destino_id IS NOT NULL
    `;
    const values = [];
    if (lojaId) {
      query += ` AND ep.loja_destino_id = $1`;
      values.push(lojaId);
    }
    query += ` ORDER BY ep.data_resposta DESC`;
    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = EmprestimoPeca;
