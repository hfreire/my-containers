package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iotdataplane"
	awsclients "github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type GetShadowArgs struct {
	ThingName  string `json:"thing_name" jsonschema:"description=The name of the IoT Thing"`
	ShadowName string `json:"shadow_name,omitempty" jsonschema:"description=Named shadow name (leave empty for classic shadow)"`
}

type UpdateShadowArgs struct {
	ThingName  string `json:"thing_name" jsonschema:"description=The name of the IoT Thing"`
	ShadowName string `json:"shadow_name,omitempty" jsonschema:"description=Named shadow name (leave empty for classic shadow)"`
	Desired    string `json:"desired" jsonschema:"description=JSON object for the desired state to set"`
}

type ListShadowsArgs struct {
	ThingName string `json:"thing_name" jsonschema:"description=The name of the IoT Thing"`
}

func RegisterShadow(server *mcp.Server, clients *awsclients.Clients) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_thing_shadow",
		Description: "Get the shadow state (desired and reported) of an IoT Thing",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args GetShadowArgs) (*mcp.CallToolResult, any, error) {
		input := &iotdataplane.GetThingShadowInput{
			ThingName: aws.String(args.ThingName),
		}
		if args.ShadowName != "" {
			input.ShadowName = aws.String(args.ShadowName)
		}

		out, err := clients.IoTDataPlane.GetThingShadow(ctx, input)
		if err != nil {
			return textResult(fmt.Sprintf("Error getting shadow: %v", err)), nil, nil
		}

		var shadow any
		if err := json.Unmarshal(out.Payload, &shadow); err != nil {
			return textResult(string(out.Payload)), nil, nil
		}
		return jsonResult(shadow)
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_thing_shadow",
		Description: "Update the desired state of an IoT Thing shadow",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args UpdateShadowArgs) (*mcp.CallToolResult, any, error) {
		var desired any
		if err := json.Unmarshal([]byte(args.Desired), &desired); err != nil {
			return textResult(fmt.Sprintf("Invalid JSON for desired state: %v", err)), nil, nil
		}

		payload, err := json.Marshal(map[string]any{
			"state": map[string]any{
				"desired": desired,
			},
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error building payload: %v", err)), nil, nil
		}

		input := &iotdataplane.UpdateThingShadowInput{
			ThingName: aws.String(args.ThingName),
			Payload:   payload,
		}
		if args.ShadowName != "" {
			input.ShadowName = aws.String(args.ShadowName)
		}

		out, err := clients.IoTDataPlane.UpdateThingShadow(ctx, input)
		if err != nil {
			return textResult(fmt.Sprintf("Error updating shadow: %v", err)), nil, nil
		}

		var result any
		if err := json.Unmarshal(out.Payload, &result); err != nil {
			return textResult(string(out.Payload)), nil, nil
		}
		return jsonResult(result)
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_named_shadows",
		Description: "List all named shadows for an IoT Thing",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args ListShadowsArgs) (*mcp.CallToolResult, any, error) {
		out, err := clients.IoTDataPlane.ListNamedShadowsForThing(ctx, &iotdataplane.ListNamedShadowsForThingInput{
			ThingName: aws.String(args.ThingName),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error listing shadows: %v", err)), nil, nil
		}

		return jsonResult(map[string]any{
			"thing_name": args.ThingName,
			"shadows":    out.Results,
		})
	})
}
