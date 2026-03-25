# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS builder

ARG VERSION

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /espen-knowledge-mcp .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates

COPY --from=builder --chmod=755 /espen-knowledge-mcp /usr/local/bin/espen-knowledge-mcp

USER nobody:nogroup

EXPOSE 8080

ENTRYPOINT ["espen-knowledge-mcp"]
CMD ["-transport", "http"]
