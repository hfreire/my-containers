# syntax=docker/dockerfile:1

ARG VERSION

FROM node:22-alpine AS runtime

ARG VERSION

# cablate/mcp-google-map is published to npm. Pin the exact version. All
# deps (@googlemaps/google-maps-services-js, @modelcontextprotocol/sdk,
# express, zod, yargs) are pure JS — no native build deps needed, so the
# image builds cleanly for both amd64 and arm64.
RUN npm install -g "@cablate/mcp-google-map@${VERSION}"

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

USER nobody:nogroup

# stdio transport: ToolHive wraps the binary's stdin/stdout into an HTTP
# proxy. No port is exposed by the container itself. GOOGLE_MAPS_API_KEY is
# read from env; GOOGLE_MAPS_ENABLED_TOOLS optionally restricts the tool
# surface (set in the MCPServer manifest, not here).
CMD ["mcp-google-map"]
