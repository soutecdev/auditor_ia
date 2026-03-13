# Stage 1: Build frontend
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && rm -rf /root/.npm
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/index.js"]
