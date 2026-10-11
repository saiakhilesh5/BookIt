FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 5000

# Shell form, not exec form: ${PORT} must expand. PaaS hosts (Render, Fly, Railway)
# inject their own PORT instead of 5000, and a pinned probe would report healthy-but-dead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-5000}/health" || exit 1

CMD ["node", "src/server.js"]
