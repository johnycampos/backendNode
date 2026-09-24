#!/bin/sh
set -e

echo "=== [Backend] Iniciando container ==="
echo "=== [Backend] Executando migrations do banco de dados ==="
npm run migrate:up

echo "=== [Backend] Iniciando API Real Revision na porta ${PORT:-5000} ==="
exec node server.js
