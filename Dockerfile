# ---------------------------------------------------------------------------
# GitLab MCP Server — Production Dockerfile
# Multi-stage build for a minimal runtime image.
# ---------------------------------------------------------------------------

# -- Stage 1: build ----------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript sources
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# -- Stage 2: runtime --------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies in runtime image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled server
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    PORT=3000 \
    USE_SSE=true

EXPOSE 3000

# Run as non-root (numeric UID required by K8s runAsNonRoot)
RUN adduser -D -h /home/mcp -s /bin/sh -u 1000 mcp && \
    chown -R 1000:1000 /app
USER 1000

ENTRYPOINT ["node", "dist/index.js"]
