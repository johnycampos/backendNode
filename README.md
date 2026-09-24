# Backend Node — Real Revision API

API REST para gestão de oficina e estoque de peças, desenvolvida em Node.js com Express e PostgreSQL.

## Variáveis de Ambiente

Crie ou configure o arquivo `.env` na raiz do diretório `backendNode/` com as seguintes variáveis:

```env
PORT=5000
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_do_banco
JWT_SECRET=seu_segredo_jwt
```

## Arquitetura Multi-Loja (Tenant)

O sistema suporta operação multi-loja centralizada:
- **Lojas cadastradas**:
  - `Real Revision` (Matriz — `is_matriz = true`)
  - `Nitori` (Filial — `is_matriz = false`)
  - `Baby Real Revision` (Filial — `is_matriz = false`)
- **Tabelas com tenant (`loja_id`)**: `users`, `itens`, `locais_estoque`, `vendas`.
- **Catálogo Global Compartilhado**: `fabricantes`, `grupos`, `subgrupos` e `unidades` são globais e compartilhados entre todas as lojas do ecossistema para manter a taxonomia uniforme.

### Papéis de Usuário (`users.role`)

- `super_admin`: Acesso à matriz com visão consolidada de todas as lojas, sem filtros forçados.
- `admin_loja`: Gerente de uma loja específica, com acesso aos dados e configurações da sua respectiva loja.
- `funcionario`: Colaborador operacional com permissões delimitadas e restrições de horários e menus.

## Autenticação

- O header de autorização espera o padrão `Authorization: Bearer <token>`.
- O payload do JWT inclui `id`, `username`, `role` e `loja_id`.

## Banco de Dados & Migrations

O banco de dados utiliza versionamento de schema com `node-pg-migrate`. Todas as alterações estruturais de tabelas devem ser gerenciadas via migrations.

### Executar Migrations

Antes de iniciar o servidor pela primeira vez ou após atualizações de schema, execute as migrations pendentes:

```sh
npm run migrate:up
```

### Reverter Última Migration

Para desfazer a última migration aplicada:

```sh
npm run migrate:down
```

### Criar Nova Migration

Para gerar um novo arquivo de migration em `migrations/`:

```sh
npm run migrate:create nome_da_migration
```

## Executando o Servidor

Após garantir que as migrations foram executadas:

```sh
# Modo desenvolvimento (com reload automático via nodemon)
npm run dev

# Modo produção
npm start
```
