# syntax=docker/dockerfile:1

ARG VERSION

FROM node:22-bookworm-slim AS builder

ARG VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --depth 1 --branch "v${VERSION}" https://github.com/excalidraw/excalidraw-mcp.git .

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

RUN pnpm install
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json

ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

USER nobody:nogroup

CMD ["node", "dist/index.js"]
