# syntax=docker/dockerfile:1

ARG VERSION

FROM python:3.13-slim AS runtime

ARG VERSION

# xing5/mcp-google-sheets is published to PyPI; pin the exact version. Its deps
# (google-api-python-client, google-auth, mcp) are pure-Python with manylinux
# wheels for both amd64 and arm64, so no build toolchain is needed.
RUN pip install --no-cache-dir "mcp-google-sheets==${VERSION}"

# FastMCP SSE binds HOST:PORT; 0.0.0.0 so the ToolHive proxy can reach it.
ENV HOST=0.0.0.0 \
    PORT=8000 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

USER nobody:nogroup

# Default transport is stdio; ToolHive consumes SSE.
CMD ["mcp-google-sheets", "--transport", "sse"]
