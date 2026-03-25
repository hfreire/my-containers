# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /build/package.json /build/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /build/dist ./dist

USER nobody:nogroup

CMD ["node", "dist/index.js"]
