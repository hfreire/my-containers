#!/bin/sh
# Filter dotenv noise from stdout to keep the JSON-RPC stdio stream clean.
# stdin passes through directly to mcp-node-red; only stdout is filtered.
mcp-node-red "$@" | while IFS= read -r line; do
  case "$line" in
    '{'*) printf '%s\n' "$line" ;;
  esac
done
