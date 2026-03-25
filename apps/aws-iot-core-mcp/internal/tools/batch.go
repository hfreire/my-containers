package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iot"
	"github.com/aws/aws-sdk-go-v2/service/iotdataplane"
	awsclients "github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type BatchCheckArgs struct {
	ThingNames []string `json:"thing_names" jsonschema:"description:List of IoT Thing names to check"`
	Shadows    []string `json:"shadows,omitempty" jsonschema:"description:Named shadows to read for each thing (leave empty for classic shadow only)"`
}

type deviceReport struct {
	ThingName    string         `json:"thing_name"`
	Connected    bool           `json:"connected"`
	ConnectedAt int64          `json:"connected_at,omitempty"`
	Error        string         `json:"error,omitempty"`
	Shadows      map[string]any `json:"shadows,omitempty"`
}

func RegisterBatch(server *mcp.Server, clients *awsclients.Clients) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "batch_check_devices",
		Description: "Check connectivity and read shadow state for multiple IoT Things in a single call. Use this when you need to inspect more than one device. Processes devices sequentially to avoid overload.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args BatchCheckArgs) (*mcp.CallToolResult, any, error) {
		if len(args.ThingNames) > 50 {
			return textResult("Too many devices: maximum 50 per batch"), nil, nil
		}

		shadowNames := args.Shadows
		if len(shadowNames) == 0 {
			shadowNames = []string{""}
		}

		reports := make([]deviceReport, 0, len(args.ThingNames))

		for _, thingName := range args.ThingNames {
			report := deviceReport{
				ThingName: thingName,
				Shadows:   make(map[string]any),
			}

			// Check connectivity
			out, err := clients.IoT.SearchIndex(ctx, &iot.SearchIndexInput{
				QueryString: aws.String(fmt.Sprintf("thingName:%s", thingName)),
				IndexName:   aws.String("AWS_Things"),
			})
			if err != nil {
				report.Error = fmt.Sprintf("connectivity check failed: %v", err)
			} else if len(out.Things) == 0 {
				report.Error = "thing not found in fleet index"
			} else {
				if out.Things[0].Connectivity.Connected != nil {
					report.Connected = *out.Things[0].Connectivity.Connected
				}
				if out.Things[0].Connectivity.Timestamp != nil {
					report.ConnectedAt = *out.Things[0].Connectivity.Timestamp
				}
			}

			// Read shadows
			for _, shadowName := range shadowNames {
				input := &iotdataplane.GetThingShadowInput{
					ThingName: aws.String(thingName),
				}
				label := "classic"
				if shadowName != "" {
					input.ShadowName = aws.String(shadowName)
					label = shadowName
				}

				shadowOut, err := clients.IoTDataPlane.GetThingShadow(ctx, input)
				if err != nil {
					report.Shadows[label] = map[string]string{"error": err.Error()}
				} else {
					var shadow any
					if err := json.Unmarshal(shadowOut.Payload, &shadow); err != nil {
						report.Shadows[label] = map[string]string{"raw": string(shadowOut.Payload)}
					} else {
						report.Shadows[label] = shadow
					}
				}
			}

			reports = append(reports, report)
		}

		return jsonResult(map[string]any{
			"device_count": len(reports),
			"devices":      reports,
		})
	})
}
