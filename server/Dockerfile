FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# Copy package files first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

USER node
EXPOSE 4000

CMD ["node", "server.js"]
