# syntax=docker/dockerfile:1

ARG VERSION

FROM node:22-alpine

ARG VERSION
RUN npm install -g "mcp-node-red@${VERSION}"

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh

USER nobody:nogroup

ENTRYPOINT ["entrypoint.sh"]
