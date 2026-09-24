FROM node:20-alpine

WORKDIR /app

# Instalar dependências necessárias
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código-fonte e definir propriedade para o usuário node
COPY --chown=node:node . .

# Garantir permissão de execução no entrypoint
RUN chmod +x entrypoint.sh

# Executar aplicação como usuário não-root por segurança
USER node

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
