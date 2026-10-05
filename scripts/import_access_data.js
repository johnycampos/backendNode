/**
 * Script de importação de dados do Access (JSONs em import_staging/)
 * para o PostgreSQL do Supabase (produção).
 *
 * Executa em transação única (BEGIN / COMMIT / ROLLBACK).
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." DB_SSL=true node scripts/import_access_data.js
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

  const stagingDir = path.resolve(__dirname, '../../import_staging');
  const fornPath = path.join(stagingDir, 'fornecedores.json');
  const itensPath = path.join(stagingDir, 'itens.json');
  const fornDePath = path.join(stagingDir, 'fornecer_de.json');

  console.log('Lendo arquivos de staging...');
  const fornecedoresJson = JSON.parse(fs.readFileSync(fornPath, 'utf8'));
  const itensJson = JSON.parse(fs.readFileSync(itensPath, 'utf8'));
  const fornecerDeJson = JSON.parse(fs.readFileSync(fornDePath, 'utf8'));
  console.log(`Carregados: ${fornecedoresJson.length} fornecedores, ${itensJson.length} itens, ${fornecerDeJson.length} vínculos fornecer_de.`);

  console.log('Conectando ao banco de dados...');
  await client.connect();

  console.log('Iniciando transação...');
  await client.query('BEGIN');

  try {
    // 2.1 Resolução da loja matriz
    const lojaRes = await client.query('SELECT id, nome FROM lojas WHERE is_matriz = true LIMIT 1');
    if (lojaRes.rows.length === 0) {
      throw new Error('Loja matriz (is_matriz = true) não encontrada na tabela lojas.');
    }
    const matrizLojaId = lojaRes.rows[0].id;
    const matrizNome = lojaRes.rows[0].nome;
    console.log(`Loja Matriz identificada: ID ${matrizLojaId} - "${matrizNome}"`);

    // 2.2 e 2.3 Criação dos catálogos
    console.log('Processando catálogos...');
    const gruposSet = new Set();
    const subgruposMap = new Map(); // key: `${grupoNorm}|||${subgrupoNorm}` -> { gNorm, sgNorm }
    const unidadesSet = new Set();
    const fabricantesSet = new Set();
    const locaisSet = new Set();

    for (const it of itensJson) {
      let g = normalizarTexto(it.grupo);
      const sg = normalizarTexto(it.subgrupo);
      if (sg && !g) {
        g = '(SEM GRUPO)';
      }
      if (g) gruposSet.add(g);
      if (sg) subgruposMap.set(`${g}|||${sg}`, { gNorm: g, sgNorm: sg });

      const u = normalizarTexto(it.unidade);
      if (u) unidadesSet.add(u);

      const f = normalizarTexto(it.fabricante);
      if (f) fabricantesSet.add(f);

      const l = normalizarTexto(it.local);
      if (l) locaisSet.add(l);
    }

    // Inserir Grupos
    console.log(`Inserindo ${gruposSet.size} grupos...`);
    const grupoRows = Array.from(gruposSet).map(nome => [nome]);
    const insertedGrupos = await batchInsert(client, 'grupos', ['nome'], grupoRows, 200, '', 'id, nome');
    const grupoIdMap = new Map();
    for (const row of insertedGrupos) {
      grupoIdMap.set(row.nome, row.id);
    }

    // Inserir Subgrupos
    console.log(`Inserindo ${subgruposMap.size} subgrupos...`);
    const subgrupoRows = [];
    const subgrupoPairKeys = [];
    for (const [key, { gNorm, sgNorm }] of subgruposMap.entries()) {
      const gId = grupoIdMap.get(gNorm);
      if (!gId) {
        throw new Error(`Grupo '${gNorm}' não encontrado no mapa de grupos para subgrupo '${sgNorm}'.`);
      }
      subgrupoRows.push([sgNorm, gId]);
      subgrupoPairKeys.push(key);
    }
    const insertedSubgrupos = await batchInsert(client, 'subgrupos', ['nome', 'grupo_id'], subgrupoRows, 200, '', 'id, nome, grupo_id');
    const subgrupoIdMap = new Map();
    for (let i = 0; i < insertedSubgrupos.length; i++) {
      const key = subgrupoPairKeys[i];
      subgrupoIdMap.set(key, insertedSubgrupos[i].id);
    }

    // Inserir Unidades
    console.log(`Inserindo ${unidadesSet.size} unidades...`);
    const unidadeRows = Array.from(unidadesSet).map(nome => [nome]);
    const insertedUnidades = await batchInsert(client, 'unidades', ['nome'], unidadeRows, 200, '', 'id, nome');
    const unidadeIdMap = new Map();
    for (const row of insertedUnidades) {
      unidadeIdMap.set(row.nome, row.id);
    }

    // Inserir Fabricantes
    console.log(`Inserindo ${fabricantesSet.size} fabricantes...`);
    const fabricanteRows = Array.from(fabricantesSet).map(nome => [nome]);
    const insertedFabricantes = await batchInsert(client, 'fabricantes', ['nome'], fabricanteRows, 200, '', 'id, nome');
    const fabricanteIdMap = new Map();
    for (const row of insertedFabricantes) {
      fabricanteIdMap.set(row.nome, row.id);
    }

    // Inserir Locais de Estoque (com loja_id = matrizLojaId)
    console.log(`Inserindo ${locaisSet.size} locais de estoque para matriz...`);
    const localRows = Array.from(locaisSet).map(nome => [nome, matrizLojaId]);
    const insertedLocais = await batchInsert(client, 'locais_estoque', ['nome', 'loja_id'], localRows, 200, '', 'id, nome');
    const localEstoqueIdMap = new Map();
    for (const row of insertedLocais) {
      localEstoqueIdMap.set(row.nome, row.id);
    }

    // 2.4 Inserir Fornecedores
    console.log(`Inserindo ${fornecedoresJson.length} fornecedores...`);
    const fornColumns = [
      'codigo', 'nome', 'fantasia', 'cnpj', 'fone', 'fax', 'cidade', 'uf',
      'ie_rg', 'endereco', 'bairro', 'cep', 'email', 'contato', 'site', 'obs',
      'transportadora', 'ultima_compra', 'cadastrado'
    ];
    const fornRows = fornecedoresJson.map(f => [
      parseTextoLivre(f.codigo),
      parseTextoLivre(f.razao) || '(SEM NOME)',
      parseTextoLivre(f.fantasia),
      parseTextoLivre(f.cnpj_cpf),
      parseTextoLivre(f.telefone),
      parseTextoLivre(f.fax),
      parseTextoLivre(f.cidade),
      parseTextoLivre(f.uf),
      parseTextoLivre(f.ie_rg),
      parseTextoLivre(f.endereco),
      parseTextoLivre(f.bairro),
      parseTextoLivre(f.cep),
      parseTextoLivre(f.email),
      parseTextoLivre(f.contato),
      parseTextoLivre(f.site),
      parseTextoLivre(f.obs),
      parseBoolean(f.transportadora),
      parseTimestamp(f.ultima_compra),
      parseTimestamp(f.cadastrado)
    ]);
    const insertedForn = await batchInsert(client, 'fornecedores', fornColumns, fornRows, 200, '', 'id, codigo');
    const fornecedorCodigoToPgId = new Map();
    for (const row of insertedForn) {
      fornecedorCodigoToPgId.set(String(row.codigo).trim(), row.id);
    }

    // 2.5 Inserir Itens
    console.log(`Inserindo ${itensJson.length} itens...`);
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

      const grupoId = gNorm ? grupoIdMap.get(gNorm) || null : null;
      const subgrupoKey = (gNorm && sgNorm) ? `${gNorm}|||${sgNorm}` : null;
      const subgrupoId = subgrupoKey ? subgrupoIdMap.get(subgrupoKey) || null : null;

      const uNorm = normalizarTexto(it.unidade);
      const unidadeId = uNorm ? unidadeIdMap.get(uNorm) || null : null;

      const fNorm = normalizarTexto(it.fabricante);
      const fabricanteId = fNorm ? fabricanteIdMap.get(fNorm) || null : null;

      const lNorm = normalizarTexto(it.local);
      const localEstoqueId = lNorm ? localEstoqueIdMap.get(lNorm) || null : null;

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
        lucro,
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
        matrizLojaId
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

    // 2.6 Inserir item_fornecedores (N:N)
    console.log('Processando vínculos item_fornecedores...');
    const warnings = [];
    const itemFornPairs = new Map(); // key: `${itemId}|||${fornId}` -> { itemId, fornId }

    // Fonte 1: itens.fornecedor
    for (const it of itensJson) {
      const fRaw = it.fornecedor ? String(it.fornecedor).trim() : null;
      if (fRaw && fRaw !== '0' && fRaw.toUpperCase() !== 'NULL') {
        const itemAccessCod = String(it.codigo).trim();
        const itemId = accessItemCodigoToPgId.get(itemAccessCod);
        const fornId = fornecedorCodigoToPgId.get(fRaw);

        if (!itemId) {
          warnings.push(`Item Access ${itemAccessCod} (peça '${it.numero}') não encontrado para vincular fornecedor '${fRaw}'`);
        } else if (!fornId) {
          warnings.push(`Fornecedor Access '${fRaw}' não encontrado para vincular item peça '${it.numero}' (Access ${itemAccessCod})`);
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
      const fornId = fornecedorCodigoToPgId.get(fornAccessCod);

      if (!itemId) {
        warnings.push(`Item Access '${itemAccessCod}' de fornecer_de não encontrado`);
      } else if (!fornId) {
        warnings.push(`Fornecedor Access '${fornAccessCod}' de fornecer_de não encontrado`);
      } else {
        itemFornPairs.set(`${itemId}|||${fornId}`, { itemId, fornId });
      }
    }

    console.log(`Inserindo ${itemFornPairs.size} vínculos únicos de item_fornecedores...`);
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

    // 2.7 Relatório final
    console.log('\n========================================');
    console.log('       RELATÓRIO DE IMPORTAÇÃO');
    console.log('========================================');
    console.log(`Loja Matriz ID:            ${matrizLojaId} ("${matrizNome}")`);
    console.log(`Grupos criados:            ${insertedGrupos.length}`);
    console.log(`Subgrupos criados:         ${insertedSubgrupos.length}`);
    console.log(`Unidades criadas:          ${insertedUnidades.length}`);
    console.log(`Fabricantes criados:       ${insertedFabricantes.length}`);
    console.log(`Locais de estoque criados: ${insertedLocais.length}`);
    console.log(`Fornecedores inseridos:    ${insertedForn.length}`);
    console.log(`Itens inseridos:           ${insertedItens.length}`);
    console.log(`Item-Fornecedores vínc.:   ${insertedItemForn.length}`);
    console.log(`Total de Warnings:         ${warnings.length}`);
    if (warnings.length > 0) {
      console.log('\nLista de Warnings:');
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
