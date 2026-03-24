package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iot"
	awsclients "github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type GetConnectivityArgs struct {
	ThingName string `json:"thing_name" jsonschema:"description=The name of the IoT Thing to check connectivity for"`
}

func RegisterConnectivity(server *mcp.Server, clients *awsclients.Clients) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_thing_connectivity_status",
		Description: "Get the connectivity status of an IoT Thing (requires fleet indexing to be enabled)",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args GetConnectivityArgs) (*mcp.CallToolResult, any, error) {
		out, err := clients.IoT.SearchIndex(ctx, &iot.SearchIndexInput{
			QueryString: aws.String(fmt.Sprintf("thingName:%s", args.ThingName)),
			IndexName:   aws.String("AWS_Things"),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error querying connectivity: %v", err)), nil, nil
		}

		if len(out.Things) == 0 {
			return textResult(fmt.Sprintf("Thing %q not found in fleet index", args.ThingName)), nil, nil
		}

		thing := out.Things[0]
		result := map[string]any{
			"thing_name": aws.ToString(thing.ThingName),
			"connected":  thing.Connectivity.Connected,
			"timestamp":  thing.Connectivity.Timestamp,
		}

		return jsonResult(result)
	})
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
