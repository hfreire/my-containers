package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/hfreire/aws-iot-core-mcp/internal/qdrant"
	"github.com/hfreire/aws-iot-core-mcp/internal/tools"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	transport := flag.String("transport", "stdio", "Transport type: stdio, sse, or http")
	addr := flag.String("addr", ":8080", "Listen address for sse/http transports")
	flag.Parse()

	ctx := context.Background()

	clients, err := aws.NewClients(ctx)
	if err != nil {
		log.Fatalf("failed to initialize AWS clients: %v", err)
	}

	knowledgeDeps := &tools.KnowledgeDeps{
		Qdrant: qdrant.NewClient(
			envOrDefault("QDRANT_URL", "http://qdrant.databases:6333"),
			os.Getenv("QDRANT_API_KEY"),
			envOrDefault("QDRANT_COLLECTION", "espen-knowledge"),
		),
		EmbeddingURL:    envOrDefault("EMBEDDING_URL", "http://litellm.default:4000/v1/embeddings"),
		EmbeddingModel:  envOrDefault("EMBEDDING_MODEL", "text-embedding-3-small"),
		EmbeddingAPIKey: os.Getenv("EMBEDDING_API_KEY"),
	}

	newServer := func() *mcp.Server {
		server := mcp.NewServer(
			&mcp.Implementation{
				Name:    "aws-iot-core-mcp",
				Version: version(),
			},
			nil,
		)

		tools.RegisterConnectivity(server, clients)
		tools.RegisterShadow(server, clients)
		tools.RegisterPackages(server, clients)
		tools.RegisterJobs(server, clients)
		tools.RegisterMQTT(server, clients)
		tools.RegisterBatch(server, clients)
		tools.RegisterKnowledge(server, knowledgeDeps)

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

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func version() string {
	if v := os.Getenv("VERSION"); v != "" {
		return v
	}
	return "dev"
}
