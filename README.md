# Backend Node — Real Revision API

API REST para gestão de oficina e estoque de peças, desenvolvida em Node.js com Express e PostgreSQL.

## Variáveis de Ambiente

Crie ou configure o arquivo `.env` na raiz do diretório `backendNode/` com as seguintes variáveis:

```env
PORT=5000
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_do_banco
JWT_SECRET=seu_segredo_jwt
```

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
