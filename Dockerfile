FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY contracts ./contracts
COPY agentteams ./agentteams
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=3000 DB_FILE=/app/data/echo.db
EXPOSE 3000
CMD ["node", "src/server.js"]
