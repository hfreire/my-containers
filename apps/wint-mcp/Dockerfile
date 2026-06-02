# syntax=docker/dockerfile:1

ARG VERSION

FROM node:22-alpine AS builder

ARG VERSION

RUN apk add --no-cache curl ca-certificates tar

WORKDIR /build

# wint-mcp publishes no tags/releases/npm — pin to commit SHA via the GitHub
# tarball endpoint (works for any ref).
RUN curl -fsSL "https://codeload.github.com/iggerask/wint-mcp/tar.gz/${VERSION}" \
    | tar -xz --strip-components=1

# Harden npm against the flaky QEMU-emulated arm64 build leg (ECONNRESET).
ENV NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=30000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json

ENV NODE_ENV=production

USER nobody:nobody

ENTRYPOINT ["node", "dist/src/index.js"]
