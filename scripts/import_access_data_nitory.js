/**
 * Script de importação de dados legados do Access (JSONs em import_staging_nitory/)
 * para a loja NITORY (filial) no PostgreSQL do Supabase (produção).
 *
 * Executa em transação única (BEGIN / COMMIT / ROLLBACK).
 *
 * Deduplica fornecedores por CNPJ/CPF ou Razão Social contra os já existentes na base.
 * Reutiliza catálogos globais existentes (grupos, subgrupos, unidades, fabricantes)
 * e insere novos apenas quando não encontrados.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." DB_SSL=true node scripts/import_access_data_nitory.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Helpers de normalização e parse
function normalizarTexto(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  return s.toUpperCase().replace(/\s+/g, ' ');
}

function parseTextoLivre(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  return s;
}

function parseNumero(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseBoolean(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'T';
}

function parseTimestamp(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  return s;
}

function cleanDigits(val) {
  if (!val) return null;
  const digits = String(val).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

async function batchInsert(client, table, columns, rows, batchSize = 200, onConflict = '', returning = '') {
  if (rows.length === 0) return [];
  const allResults = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const valueClauses = [];
    const params = [];
    let paramIdx = 1;

    for (const row of chunk) {
      const rowPlaceholders = [];
      for (let c = 0; c < columns.length; c++) {
        rowPlaceholders.push(`$${paramIdx++}`);
        params.push(row[c]);
      }
      valueClauses.push(`(${rowPlaceholders.join(', ')})`);
    }

    let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueClauses.join(', ')}`;
    if (onConflict) {
      query += ` ${onConflict}`;
    }
    if (returning) {
      query += ` RETURNING ${returning}`;
    }

    const res = await client.query(query, params);
    if (returning) {
      allResults.push(...res.rows);
    }
  }

  return allResults;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERRO FATAL: Variável de ambiente DATABASE_URL não definida.');
    process.exit(1);
  }

  const isSsl = process.env.DB_SSL === 'true' || connectionString.includes('sslmode=require');
  const client = new Client({
    connectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : false
  });

  const stagingDir = path.resolve(__dirname, '../../import_staging_nitory');
  const fornPath = path.join(stagingDir, 'fornecedores.json');
  const itensPath = path.join(stagingDir, 'itens.json');
  const fornDePath = path.join(stagingDir, 'fornecer_de.json');

  console.log('Lendo arquivos de staging de Nitory...');
  const fornecedoresJson = JSON.parse(fs.readFileSync(fornPath, 'utf8'));
  const itensJson = JSON.parse(fs.readFileSync(itensPath, 'utf8'));
  const fornecerDeJson = JSON.parse(fs.readFileSync(fornDePath, 'utf8'));
  console.log(`Carregados: ${fornecedoresJson.length} fornecedores, ${itensJson.length} itens, ${fornecerDeJson.length} vínculos fornecer_de.`);

  console.log('Conectando ao banco de dados...');
  await client.connect();

  console.log('Iniciando transação...');
  await client.query('BEGIN');

  try {
    // 1. Resolver dinamicamente a loja Nitory
    const lojaRes = await client.query("SELECT id, nome, is_matriz FROM lojas WHERE nome ILIKE '%nitor%' LIMIT 1;");
    if (lojaRes.rows.length === 0) {
      throw new Error("Loja 'Nitori' não encontrada na tabela lojas.");
    }
    const nitoryLojaId = lojaRes.rows[0].id;
    const nitoryLojaNome = lojaRes.rows[0].nome;
    console.log(`Loja identificada: ID ${nitoryLojaId} - "${nitoryLojaNome}" (is_matriz: ${lojaRes.rows[0].is_matriz})`);

    // 2. Carregar catálogos existentes do banco
    console.log('Carregando catálogos existentes...');
    const dbGrupos = await client.query('SELECT id, nome FROM grupos;');
    const grupoMap = new Map();
    for (const r of dbGrupos.rows) grupoMap.set(r.nome, r.id);

    const dbSubgrupos = await client.query(`
      SELECT s.id, s.nome, g.nome as grupo_nome
      FROM subgrupos s
      JOIN grupos g ON s.grupo_id = g.id;
    `);
    const subgrupoMap = new Map(); // key: `${grupoNorm}|||${subgrupoNorm}` -> id
    for (const r of dbSubgrupos.rows) {
      subgrupoMap.set(`${r.grupo_nome}|||${r.nome}`, r.id);
    }

    const dbUnidades = await client.query('SELECT id, nome FROM unidades;');
    const unidadeMap = new Map();
    for (const r of dbUnidades.rows) unidadeMap.set(r.nome, r.id);

    const dbFabricantes = await client.query('SELECT id, nome FROM fabricantes;');
    const fabricanteMap = new Map();
    for (const r of dbFabricantes.rows) fabricanteMap.set(r.nome, r.id);

    const dbLocais = await client.query('SELECT id, nome FROM locais_estoque WHERE loja_id = $1;', [nitoryLojaId]);
    const localEstoqueMap = new Map();
    for (const r of dbLocais.rows) localEstoqueMap.set(r.nome, r.id);

    // 3. Identificar novos catálogos necessários para Nitory
    console.log('Analisando novos catálogos a criar...');
    const novosGruposSet = new Set();
    const novosSubgruposMap = new Map();
    const novasUnidadesSet = new Set();
    const novosFabricantesSet = new Set();
    const novosLocaisSet = new Set();

    for (const it of itensJson) {
      let g = normalizarTexto(it.grupo);
      const sg = normalizarTexto(it.subgrupo);
      if (sg && !g) {
        g = '(SEM GRUPO)';
      }
      if (g && !grupoMap.has(g)) novosGruposSet.add(g);
      if (g && sg && !subgrupoMap.has(`${g}|||${sg}`)) {
        novosSubgruposMap.set(`${g}|||${sg}`, { gNorm: g, sgNorm: sg });
      }

      const u = normalizarTexto(it.unidade);
      if (u && !unidadeMap.has(u)) novasUnidadesSet.add(u);

      const f = normalizarTexto(it.fabricante);
      if (f && !fabricanteMap.has(f)) novosFabricantesSet.add(f);

      const l = normalizarTexto(it.local);
      if (l && !localEstoqueMap.has(l)) novosLocaisSet.add(l);
    }

    // Inserir novos grupos
    let gruposCriados = 0;
    if (novosGruposSet.size > 0) {
      console.log(`Inserindo ${novosGruposSet.size} novos grupos...`);
      const rows = Array.from(novosGruposSet).map(nome => [nome]);
      const inserted = await batchInsert(client, 'grupos', ['nome'], rows, 200, '', 'id, nome');
      for (const r of inserted) grupoMap.set(r.nome, r.id);
      gruposCriados = inserted.length;
    }

    // Inserir novos subgrupos
    let subgruposCriados = 0;
    if (novosSubgruposMap.size > 0) {
      console.log(`Inserindo ${novosSubgruposMap.size} novos subgrupos...`);
      const rows = [];
      const keys = [];
      for (const [key, { gNorm, sgNorm }] of novosSubgruposMap.entries()) {
        const gId = grupoMap.get(gNorm);
        if (!gId) throw new Error(`Grupo '${gNorm}' não encontrado para o subgrupo '${sgNorm}'.`);
        rows.push([sgNorm, gId]);
        keys.push(key);
      }
      const inserted = await batchInsert(client, 'subgrupos', ['nome', 'grupo_id'], rows, 200, '', 'id, nome');
      for (let i = 0; i < inserted.length; i++) {
        subgrupoMap.set(keys[i], inserted[i].id);
      }
      subgruposCriados = inserted.length;
    }

    // Inserir novas unidades
    let unidadesCriadas = 0;
    if (novasUnidadesSet.size > 0) {
      console.log(`Inserindo ${novasUnidadesSet.size} novas unidades...`);
      const rows = Array.from(novasUnidadesSet).map(nome => [nome]);
      const inserted = await batchInsert(client, 'unidades', ['nome'], rows, 200, '', 'id, nome');
      for (const r of inserted) unidadeMap.set(r.nome, r.id);
      unidadesCriadas = inserted.length;
    }

    // Inserir novos fabricantes
    let fabricantesCriados = 0;
    if (novosFabricantesSet.size > 0) {
      console.log(`Inserindo ${novosFabricantesSet.size} novos fabricantes...`);
      const rows = Array.from(novosFabricantesSet).map(nome => [nome]);
      const inserted = await batchInsert(client, 'fabricantes', ['nome'], rows, 200, '', 'id, nome');
      for (const r of inserted) fabricanteMap.set(r.nome, r.id);
      fabricantesCriados = inserted.length;
    }

    // Inserir locais de estoque para Nitori
    let locaisCriados = 0;
    if (novosLocaisSet.size > 0) {
      console.log(`Inserindo ${novosLocaisSet.size} locais de estoque para a loja ${nitoryLojaNome}...`);
      const rows = Array.from(novosLocaisSet).map(nome => [nome, nitoryLojaId]);
      const inserted = await batchInsert(client, 'locais_estoque', ['nome', 'loja_id'], rows, 200, '', 'id, nome');
      for (const r of inserted) localEstoqueMap.set(r.nome, r.id);
      locaisCriados = inserted.length;
    }

    // 4. Fornecedores: Deduplicação por CNPJ e Razão Social
    console.log('Processando fornecedores de Nitory (dedupe por CNPJ/Razão Social)...');
    const dbForn = await client.query('SELECT id, codigo, nome, cnpj FROM fornecedores;');
    const fornByCnpj = new Map();
    const fornByNome = new Map();

    for (const f of dbForn.rows) {
      const c = cleanDigits(f.cnpj);
      if (c) fornByCnpj.set(c, f.id);
      const n = normalizarTexto(f.nome);
      if (n) fornByNome.set(n, f.id);
    }

    const accessFornecedorCodigoToPgId = new Map();
    let fornecedoresReaproveitados = 0;
    let fornecedoresReaproveitadosCnpj = 0;
    let fornecedoresReaproveitadosNome = 0;
    const novosFornecedoresRows = [];
    const novosFornecedoresAccessCods = [];

    for (const fn of fornecedoresJson) {
      const accessCod = String(fn.codigo).trim();
      const cnpjLimpo = cleanDigits(fn.cnpj_cpf);
      const razaoNorm = normalizarTexto(fn.razao);

      let matchedId = null;
      if (cnpjLimpo && fornByCnpj.has(cnpjLimpo)) {
        matchedId = fornByCnpj.get(cnpjLimpo);
        fornecedoresReaproveitadosCnpj++;
      } else if (razaoNorm && fornByNome.has(razaoNorm)) {
        matchedId = fornByNome.get(razaoNorm);
        fornecedoresReaproveitadosNome++;
      }

      if (matchedId) {
        fornecedoresReaproveitados++;
        accessFornecedorCodigoToPgId.set(accessCod, matchedId);
      } else {
        novosFornecedoresRows.push([
          parseTextoLivre(fn.codigo),
          parseTextoLivre(fn.razao) || '(SEM NOME)',
          parseTextoLivre(fn.fantasia),
          parseTextoLivre(fn.cnpj_cpf),
          parseTextoLivre(fn.telefone),
          parseTextoLivre(fn.fax),
          parseTextoLivre(fn.cidade),
          parseTextoLivre(fn.uf),
          parseTextoLivre(fn.ie_rg),
          parseTextoLivre(fn.endereco),
          parseTextoLivre(fn.bairro),
          parseTextoLivre(fn.cep),
          parseTextoLivre(fn.email),
          parseTextoLivre(fn.contato),
          parseTextoLivre(fn.site),
          parseTextoLivre(fn.obs),
          parseBoolean(fn.transportadora),
          parseTimestamp(fn.ultima_compra),
          parseTimestamp(fn.cadastrado)
        ]);
        novosFornecedoresAccessCods.push(accessCod);
      }
    }

    let fornecedoresInseridos = 0;
    if (novosFornecedoresRows.length > 0) {
      console.log(`Inserindo ${novosFornecedoresRows.length} novos fornecedores...`);
      const fornColumns = [
        'codigo', 'nome', 'fantasia', 'cnpj', 'fone', 'fax', 'cidade', 'uf',
        'ie_rg', 'endereco', 'bairro', 'cep', 'email', 'contato', 'site', 'obs',
        'transportadora', 'ultima_compra', 'cadastrado'
      ];
      const inserted = await batchInsert(client, 'fornecedores', fornColumns, novosFornecedoresRows, 200, '', 'id, codigo');
      for (let i = 0; i < inserted.length; i++) {
        const accessCod = novosFornecedoresAccessCods[i];
        accessFornecedorCodigoToPgId.set(accessCod, inserted[i].id);
      }
      fornecedoresInseridos = inserted.length;
    }

    // 5. Inserir Itens para Nitory
    console.log(`Inserindo ${itensJson.length} itens para a loja ${nitoryLojaNome}...`);
    const itemColumns = [
      'codigo', 'nome', 'nome_curto', 'grupo_id', 'subgrupo_id', 'custo_compra',
      'percentual_lucro', 'valor', 'preco_consumidor', 'preco_revenda', 'preco_outros',
      'quantidade_disponivel', 'lote_ideal', 'quantidade_minima', 'unidade_id',
      'fabricante_id', 'local_estoque_id', 'gaveta', 'observacoes', 'loja_id'
    ];

    const itemRows = itensJson.map(it => {
      let gNorm = normalizarTexto(it.grupo);
      const sgNorm = normalizarTexto(it.subgrupo);
      if (sgNorm && !gNorm) {
        gNorm = '(SEM GRUPO)';
      }

      const grupoId = gNorm ? grupoMap.get(gNorm) || null : null;
      const subgrupoKey = (gNorm && sgNorm) ? `${gNorm}|||${sgNorm}` : null;
      const subgrupoId = subgrupoKey ? subgrupoMap.get(subgrupoKey) || null : null;

      const uNorm = normalizarTexto(it.unidade);
      const unidadeId = uNorm ? unidadeMap.get(uNorm) || null : null;

      const fNorm = normalizarTexto(it.fabricante);
      const fabricanteId = fNorm ? fabricanteMap.get(fNorm) || null : null;

      const lNorm = normalizarTexto(it.local);
      const localEstoqueId = lNorm ? localEstoqueMap.get(lNorm) || null : null;

      const custo = parseNumero(it.custo);
      const lucro = parseNumero(it.lucro);
      const venda = parseNumero(it.venda);
      const preco1 = parseNumero(it.preco_1);
      const preco2 = parseNumero(it.preco_2);
      const estoqueDisp = parseNumero(it.estoque_disp) ?? 0;
      const estoqueIdeal = parseNumero(it.estoque_ideal);
      const estoqueMin = parseNumero(it.estoque_min);

      return [
        parseTextoLivre(it.numero),          // codigo no app
        parseTextoLivre(it.nome),
        parseTextoLivre(it.nomecurto),
        grupoId,
        subgrupoId,
        custo,
        lucro,                                // percentual_lucro preservado real
        venda,
        venda,                                // preco_consumidor = venda
        preco1,
        preco2,
        estoqueDisp,
        estoqueIdeal,
        estoqueMin,
        unidadeId,
        fabricanteId,
        localEstoqueId,
        parseTextoLivre(it.gaveta),
        parseTextoLivre(it.utilizado),        // observacoes
        nitoryLojaId
      ];
    });

    const insertedItens = await batchInsert(client, 'itens', itemColumns, itemRows, 200, '', 'id, codigo');
    const pgIdByNumero = new Map();
    for (const row of insertedItens) {
      pgIdByNumero.set(String(row.codigo).trim(), row.id);
    }

    // Mapear it.codigo (Access PK) -> itens.id (Postgres serial)
    const accessItemCodigoToPgId = new Map();
    for (const it of itensJson) {
      const pgId = pgIdByNumero.get(String(it.numero).trim());
      if (pgId) {
        accessItemCodigoToPgId.set(String(it.codigo).trim(), pgId);
      }
    }

    // 6. Inserir item_fornecedores (N:N)
    console.log('Processando vínculos item_fornecedores...');
    const warnings = [];
    const itemFornPairs = new Map(); // key: `${itemId}|||${fornId}` -> { itemId, fornId }

    // Fonte 1: itens.fornecedor
    for (const it of itensJson) {
      const fRaw = it.fornecedor ? String(it.fornecedor).trim() : null;
      if (fRaw && fRaw !== '0' && fRaw.toUpperCase() !== 'NULL') {
        const itemAccessCod = String(it.codigo).trim();
        const itemId = accessItemCodigoToPgId.get(itemAccessCod);
        const fornId = accessFornecedorCodigoToPgId.get(fRaw);

        if (!itemId) {
          warnings.push(`Item Access ${itemAccessCod} (peça '${it.numero}') não encontrado`);
        } else if (!fornId) {
          warnings.push(`Fornecedor Access '${fRaw}' não encontrado para item peça '${it.numero}' (Access ${itemAccessCod})`);
        } else {
          itemFornPairs.set(`${itemId}|||${fornId}`, { itemId, fornId });
        }
      }
    }

    // Fonte 2: fornecer_de.json
    for (const row of fornecerDeJson) {
      const itemAccessCod = String(row.cod_item).trim();
      const fornAccessCod = String(row.cod_for).trim();
      const itemId = accessItemCodigoToPgId.get(itemAccessCod);
      const fornId = accessFornecedorCodigoToPgId.get(fornAccessCod);

      if (!itemId) {
        warnings.push(`Item Access '${itemAccessCod}' de fornecer_de não encontrado`);
      } else if (!fornId) {
        warnings.push(`Fornecedor Access '${fornAccessCod}' de fornecer_de não encontrado`);
      } else {
        itemFornPairs.set(`${itemId}|||${fornId}`, { itemId, fornId });
      }
    }

    console.log(`Inserindo ${itemFornPairs.size} vínculos de item_fornecedores...`);
    const pairRows = Array.from(itemFornPairs.values()).map(p => [p.itemId, p.fornId]);
    const insertedItemForn = await batchInsert(
      client,
      'item_fornecedores',
      ['item_id', 'fornecedor_id'],
      pairRows,
      500,
      'ON CONFLICT (item_id, fornecedor_id) DO NOTHING',
      'id'
    );

    // 7. Relatório Final
    console.log('\n========================================');
    console.log('  RELATÓRIO DE IMPORTAÇÃO — LOJA NITORY');
    console.log('========================================');
    console.log(`Loja Destino:              ID ${nitoryLojaId} ("${nitoryLojaNome}")`);
    console.log(`Fornecedores total Nitory: ${fornecedoresJson.length}`);
    console.log(`  - Reaproveitados (dedupe): ${fornecedoresReaproveitados} (CNPJ: ${fornecedoresReaproveitadosCnpj}, Nome: ${fornecedoresReaproveitadosNome})`);
    console.log(`  - Criados novos:           ${fornecedoresInseridos}`);
    console.log(`Itens inseridos (Nitory):  ${insertedItens.length}`);
    console.log(`Item-Fornecedores vínc.:   ${insertedItemForn.length}`);
    console.log('\nNovos registros no catálogo:');
    console.log(`  - Grupos novos:          ${gruposCriados}`);
    console.log(`  - Subgrupos novos:       ${subgruposCriados}`);
    console.log(`  - Unidades novas:        ${unidadesCriadas}`);
    console.log(`  - Fabricantes novos:     ${fabricantesCriados}`);
    console.log(`  - Locais estoque (Nitory): ${locaisCriados}`);
    console.log(`\nTotal de Warnings:         ${warnings.length}`);
    if (warnings.length > 0) {
      console.log('Lista de Warnings:');
      warnings.forEach((w, idx) => console.log(`  [${idx + 1}] ${w}`));
    }
    console.log('========================================\n');

    console.log('Executando COMMIT da transação...');
    await client.query('COMMIT');
    console.log('Transação COMMITADA com sucesso!');
  } catch (error) {
    console.error('ERRO FATAL NA IMPORTAÇÃO! Executando ROLLBACK...', error);
    try {
      await client.query('ROLLBACK');
      console.log('ROLLBACK executado com sucesso. Nenhum dado foi persistido.');
    } catch (rbErr) {
      console.error('Erro ao executar ROLLBACK:', rbErr);
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Execução finalizada com erro:', err);
  process.exit(1);
});
