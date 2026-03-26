package qdrant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	apiKey     string
	collection string
	httpClient *http.Client
}

type SearchResult struct {
	ID      string         `json:"id"`
	Score   float64        `json:"score"`
	Payload map[string]any `json:"payload"`
}

type Match struct {
	Value string `json:"value"`
}

type Condition struct {
	Key   string `json:"key"`
	Match *Match `json:"match,omitempty"`
}

type Filter struct {
	Must []Condition `json:"must,omitempty"`
}

type searchRequest struct {
	Vector      []float64 `json:"vector"`
	Limit       int       `json:"limit"`
	WithPayload bool      `json:"with_payload"`
	Filter      *Filter   `json:"filter,omitempty"`
}

type searchResponse struct {
	Result []struct {
		ID      any            `json:"id"`
		Score   float64        `json:"score"`
		Payload map[string]any `json:"payload"`
	} `json:"result"`
}

func NewClient(baseURL, apiKey, collection string) *Client {
	return &Client{
		baseURL:    baseURL,
		apiKey:     apiKey,
		collection: collection,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) Search(ctx context.Context, vector []float64, topK int, filter *Filter) ([]SearchResult, error) {
	body, err := json.Marshal(searchRequest{
		Vector:      vector,
		Limit:       topK,
		WithPayload: true,
		Filter:      filter,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal search request: %w", err)
	}

	url := fmt.Sprintf("%s/collections/%s/points/search", c.baseURL, c.collection)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("api-key", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var searchResp searchResponse
	if err := json.Unmarshal(respBody, &searchResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	results := make([]SearchResult, 0, len(searchResp.Result))
	for _, r := range searchResp.Result {
		results = append(results, SearchResult{
			ID:      fmt.Sprintf("%v", r.ID),
			Score:   r.Score,
			Payload: r.Payload,
		})
	}
	return results, nil
}