package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/hfreire/aws-iot-core-mcp/internal/aws"
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
