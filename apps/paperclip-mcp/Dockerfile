# syntax=docker/dockerfile:1

ARG VERSION

FROM python:3.13-slim AS runtime

ARG VERSION

# wizarck/paperclip-mcp is published to PyPI; pin the exact version. Its deps
# (fastmcp, httpx, python-dotenv) are pure-Python with manylinux wheels for
# both amd64 and arm64, so no build toolchain is needed.
RUN pip install --no-cache-dir "paperclip-mcp==${VERSION}"

ENV PYTHONUNBUFFERED=1

EXPOSE 9011

USER nobody:nogroup

# Default bind is 127.0.0.1; 0.0.0.0 so the ToolHive proxy can reach it.
CMD ["paperclip-mcp", "--host", "0.0.0.0", "--port", "9011", "--transport", "streamable-http"]
