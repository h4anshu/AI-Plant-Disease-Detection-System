FROM node:20-slim

WORKDIR /app

# Copy package files first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

EXPOSE 4000

CMD ["node", "server.js"]