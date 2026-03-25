package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/hfreire/espen-knowledge-mcp/internal/qdrant"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type SearchArgs struct {
	Query string `json:"query" jsonschema:"description:Natural language query to search the knowledge base"`
	TopK  int    `json:"top_k,omitempty" jsonschema:"description:Number of results to return (default 5, max 10)"`
}

type Deps struct {
	Qdrant       *qdrant.Client
	EmbeddingURL string
	EmbeddingModel string
	EmbeddingAPIKey string
}

func RegisterSearch(server *mcp.Server, deps *Deps) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "search_knowledge",
		Description: "Search the Espen knowledge base for shadow state field documentation and inverter alarm/error code references. Use this when you encounter unknown shadow fields, error codes, or alarm values.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args SearchArgs) (*mcp.CallToolResult, any, error) {
		topK := args.TopK
		if topK <= 0 {
			topK = 5
		}
		if topK > 10 {
			topK = 10
		}

		// Generate embedding for the query
		vector, err := getEmbedding(ctx, deps, args.Query)
		if err != nil {
			return textResult(fmt.Sprintf("Error generating embedding: %v", err)), nil, nil
		}

		// Search Qdrant
		results, err := deps.Qdrant.Search(ctx, vector, topK)
		if err != nil {
			return textResult(fmt.Sprintf("Error searching knowledge base: %v", err)), nil, nil
		}

		if len(results) == 0 {
			return textResult("No relevant knowledge found for this query."), nil, nil
		}

		// Format results
		entries := make([]map[string]any, 0, len(results))
		for _, r := range results {
			entry := map[string]any{
				"score": r.Score,
			}
			for k, v := range r.Payload {
				entry[k] = v
			}
			entries = append(entries, entry)
		}

		return jsonResult(map[string]any{
			"query":   args.Query,
			"results": entries,
		})
	})
}

type embeddingRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type embeddingResponse struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
}

func getEmbedding(ctx context.Context, deps *Deps, text string) ([]float64, error) {
	body, err := json.Marshal(embeddingRequest{
		Model: deps.EmbeddingModel,
		Input: []string{text},
	})
	if err != nil {
		return nil, fmt.Errorf("marshal embedding request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", deps.EmbeddingURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if deps.EmbeddingAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+deps.EmbeddingAPIKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var embResp embeddingResponse
	if err := json.Unmarshal(respBody, &embResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	if len(embResp.Data) == 0 || len(embResp.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}

	return embResp.Data[0].Embedding, nil
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{
			&mcp.TextContent{Text: text},
		},
	}
}

func jsonResult(v any) (*mcp.CallToolResult, any, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return textResult(fmt.Sprintf("Error marshalling result: %v", err)), nil, nil
	}
	return textResult(string(b)), nil, nil
}
