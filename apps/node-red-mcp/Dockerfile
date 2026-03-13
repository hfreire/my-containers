FROM node:22-alpine
RUN npm install -g mcp-node-red
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
