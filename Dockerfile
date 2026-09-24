FROM node:20-alpine

WORKDIR /app

# Instalar dependências necessárias
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código-fonte
COPY . .

# Garantir permissão de execução no entrypoint
RUN chmod +x entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
