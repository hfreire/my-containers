package tools

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iot"
	awsclients "github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type ListPackagesArgs struct {
	MaxResults int32 `json:"max_results,omitempty" jsonschema:"description:Maximum number of packages to return (default 25)"`
}

type GetPackageArgs struct {
	PackageName string `json:"package_name" jsonschema:"description:The name of the IoT software package"`
}

type ListPackageVersionsArgs struct {
	PackageName string `json:"package_name" jsonschema:"description:The name of the IoT software package"`
	MaxResults  int32  `json:"max_results,omitempty" jsonschema:"description:Maximum number of versions to return (default 25)"`
}

type GetPackageVersionArgs struct {
	PackageName string `json:"package_name" jsonschema:"description:The name of the IoT software package"`
	VersionName string `json:"version_name" jsonschema:"description:The version name to retrieve"`
}

func RegisterPackages(server *mcp.Server, clients *awsclients.Clients) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_packages",
		Description: "List IoT software packages",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args ListPackagesArgs) (*mcp.CallToolResult, any, error) {
		maxResults := args.MaxResults
		if maxResults == 0 {
			maxResults = 25
		}

		out, err := clients.IoT.ListPackages(ctx, &iot.ListPackagesInput{
			MaxResults: aws.Int32(maxResults),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error listing packages: %v", err)), nil, nil
		}

		packages := make([]map[string]any, 0, len(out.PackageSummaries))
		for _, p := range out.PackageSummaries {
			packages = append(packages, map[string]any{
				"package_name":   aws.ToString(p.PackageName),
				"default_version": aws.ToString(p.DefaultVersionName),
				"creation_date":  p.CreationDate,
				"last_modified":  p.LastModifiedDate,
			})
		}
		return jsonResult(packages)
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_package",
		Description: "Get details of a specific IoT software package",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args GetPackageArgs) (*mcp.CallToolResult, any, error) {
		out, err := clients.IoT.GetPackage(ctx, &iot.GetPackageInput{
			PackageName: aws.String(args.PackageName),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error getting package: %v", err)), nil, nil
		}

		return jsonResult(map[string]any{
			"package_name":    aws.ToString(out.PackageName),
			"description":     aws.ToString(out.Description),
			"default_version": aws.ToString(out.DefaultVersionName),
			"creation_date":   out.CreationDate,
			"last_modified":   out.LastModifiedDate,
		})
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_package_versions",
		Description: "List all versions of an IoT software package",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args ListPackageVersionsArgs) (*mcp.CallToolResult, any, error) {
		maxResults := args.MaxResults
		if maxResults == 0 {
			maxResults = 25
		}

		out, err := clients.IoT.ListPackageVersions(ctx, &iot.ListPackageVersionsInput{
			PackageName: aws.String(args.PackageName),
			MaxResults:  aws.Int32(maxResults),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error listing package versions: %v", err)), nil, nil
		}

		versions := make([]map[string]any, 0, len(out.PackageVersionSummaries))
		for _, v := range out.PackageVersionSummaries {
			versions = append(versions, map[string]any{
				"package_name":  aws.ToString(v.PackageName),
				"version_name":  aws.ToString(v.VersionName),
				"status":        string(v.Status),
				"creation_date": v.CreationDate,
				"last_modified": v.LastModifiedDate,
			})
		}
		return jsonResult(map[string]any{
			"package_name": args.PackageName,
			"versions":     versions,
		})
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_package_version",
		Description: "Get details of a specific version of an IoT software package",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args GetPackageVersionArgs) (*mcp.CallToolResult, any, error) {
		out, err := clients.IoT.GetPackageVersion(ctx, &iot.GetPackageVersionInput{
			PackageName: aws.String(args.PackageName),
			VersionName: aws.String(args.VersionName),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error getting package version: %v", err)), nil, nil
		}

		return jsonResult(map[string]any{
			"package_name":  aws.ToString(out.PackageName),
			"version_name":  aws.ToString(out.VersionName),
			"description":   aws.ToString(out.Description),
			"status":        string(out.Status),
			"attributes":    out.Attributes,
			"creation_date": out.CreationDate,
			"last_modified": out.LastModifiedDate,
		})
	})
}
