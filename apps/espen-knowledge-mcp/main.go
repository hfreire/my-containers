package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/hfreire/espen-knowledge-mcp/internal/qdrant"
	"github.com/hfreire/espen-knowledge-mcp/internal/tools"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	transport := flag.String("transport", "stdio", "Transport type: stdio, sse, or http")
	addr := flag.String("addr", ":8080", "Listen address for sse/http transports")
	flag.Parse()

	ctx := context.Background()

	qdrantClient := qdrant.NewClient(
		envOrDefault("QDRANT_URL", "http://qdrant.databases:6333"),
		os.Getenv("QDRANT_API_KEY"),
		envOrDefault("QDRANT_COLLECTION", "espen-knowledge"),
	)

	deps := &tools.Deps{
		Qdrant:          qdrantClient,
		EmbeddingURL:    envOrDefault("EMBEDDING_URL", "http://litellm.default:4000/v1/embeddings"),
		EmbeddingModel:  envOrDefault("EMBEDDING_MODEL", "text-embedding-3-small"),
		EmbeddingAPIKey: os.Getenv("EMBEDDING_API_KEY"),
	}

	newServer := func() *mcp.Server {
		server := mcp.NewServer(
			&mcp.Implementation{
				Name:    "espen-knowledge-mcp",
				Version: version(),
			},
			nil,
		)
		tools.RegisterSearch(server, deps)
		return server
	}

	switch *transport {
	case "stdio":
		server := newServer()
		if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil {
			log.Fatalf("server error: %v", err)
		}
	case "sse":
		handler := mcp.NewSSEHandler(func(r *http.Request) *mcp.Server {
			return newServer()
		}, nil)
		log.Printf("SSE server listening on %s", *addr)
		if err := http.ListenAndServe(*addr, handler); err != nil {
			log.Fatalf("server error: %v", err)
		}
	case "http":
		handler := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
			return newServer()
		}, nil)
		log.Printf("Streamable HTTP server listening on %s", *addr)
		if err := http.ListenAndServe(*addr, handler); err != nil {
			log.Fatalf("server error: %v", err)
		}
	default:
		log.Fatalf("unknown transport: %s (use stdio, sse, or http)", *transport)
	}
}

func version() string {
	if v := os.Getenv("VERSION"); v != "" {
		return v
	}
	return "dev"
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
