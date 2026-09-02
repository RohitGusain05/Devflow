FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY database ./database

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
