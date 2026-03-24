package tools

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iot"
	"github.com/aws/aws-sdk-go-v2/service/iot/types"
	awsclients "github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type ListJobsArgs struct {
	MaxResults int32  `json:"max_results,omitempty" jsonschema:"description=Maximum number of jobs to return (default 25)"`
	Status     string `json:"status,omitempty" jsonschema:"description=Filter by job status: IN_PROGRESS CANCELED COMPLETED DELETION_IN_PROGRESS SCHEDULED"`
}

type DescribeJobArgs struct {
	JobID string `json:"job_id" jsonschema:"description=The unique identifier of the job"`
}

type ListJobExecutionsForJobArgs struct {
	JobID      string `json:"job_id" jsonschema:"description=The unique identifier of the job"`
	MaxResults int32  `json:"max_results,omitempty" jsonschema:"description=Maximum number of executions to return (default 25)"`
	Status     string `json:"status,omitempty" jsonschema:"description=Filter by execution status: QUEUED IN_PROGRESS SUCCEEDED FAILED TIMED_OUT REJECTED REMOVED CANCELED"`
}

type ListJobExecutionsForThingArgs struct {
	ThingName  string `json:"thing_name" jsonschema:"description=The name of the IoT Thing"`
	MaxResults int32  `json:"max_results,omitempty" jsonschema:"description=Maximum number of executions to return (default 25)"`
	Status     string `json:"status,omitempty" jsonschema:"description=Filter by execution status: QUEUED IN_PROGRESS SUCCEEDED FAILED TIMED_OUT REJECTED REMOVED CANCELED"`
}

type DescribeJobExecutionArgs struct {
	JobID     string `json:"job_id" jsonschema:"description=The unique identifier of the job"`
	ThingName string `json:"thing_name" jsonschema:"description=The name of the IoT Thing"`
}

func RegisterJobs(server *mcp.Server, clients *awsclients.Clients) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_jobs",
		Description: "List IoT jobs with optional status filter",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args ListJobsArgs) (*mcp.CallToolResult, any, error) {
		maxResults := args.MaxResults
		if maxResults == 0 {
			maxResults = 25
		}

		input := &iot.ListJobsInput{
			MaxResults: aws.Int32(maxResults),
		}
		if args.Status != "" {
			input.Status = types.JobStatus(args.Status)
		}

		out, err := clients.IoT.ListJobs(ctx, input)
		if err != nil {
			return textResult(fmt.Sprintf("Error listing jobs: %v", err)), nil, nil
		}

		jobs := make([]map[string]any, 0, len(out.Jobs))
		for _, j := range out.Jobs {
			jobs = append(jobs, map[string]any{
				"job_id":        aws.ToString(j.JobId),
				"status":        string(j.Status),
				"target_selection": string(j.TargetSelection),
				"created_at":    j.CreatedAt,
				"completed_at":  j.CompletedAt,
				"last_updated":  j.LastUpdatedAt,
			})
		}
		return jsonResult(jobs)
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "describe_job",
		Description: "Get detailed information about a specific IoT job",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args DescribeJobArgs) (*mcp.CallToolResult, any, error) {
		out, err := clients.IoT.DescribeJob(ctx, &iot.DescribeJobInput{
			JobId: aws.String(args.JobID),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error describing job: %v", err)), nil, nil
		}

		j := out.Job
		result := map[string]any{
			"job_id":           aws.ToString(j.JobId),
			"status":           string(j.Status),
			"description":      aws.ToString(j.Description),
			"targets":          j.Targets,
			"target_selection": string(j.TargetSelection),
			"created_at":       j.CreatedAt,
			"completed_at":     j.CompletedAt,
			"last_updated":     j.LastUpdatedAt,
			"comment":          aws.ToString(j.Comment),
		}

		if j.JobProcessDetails != nil {
			result["process_details"] = map[string]any{
				"number_of_succeeded_things":   j.JobProcessDetails.NumberOfSucceededThings,
				"number_of_failed_things":      j.JobProcessDetails.NumberOfFailedThings,
				"number_of_in_progress_things": j.JobProcessDetails.NumberOfInProgressThings,
				"number_of_queued_things":      j.JobProcessDetails.NumberOfQueuedThings,
				"number_of_canceled_things":    j.JobProcessDetails.NumberOfCanceledThings,
				"number_of_rejected_things":    j.JobProcessDetails.NumberOfRejectedThings,
				"number_of_timed_out_things":   j.JobProcessDetails.NumberOfTimedOutThings,
				"number_of_removed_things":     j.JobProcessDetails.NumberOfRemovedThings,
			}
		}
		return jsonResult(result)
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_job_executions_for_job",
		Description: "List all executions of a specific IoT job across things",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args ListJobExecutionsForJobArgs) (*mcp.CallToolResult, any, error) {
		maxResults := args.MaxResults
		if maxResults == 0 {
			maxResults = 25
		}

		input := &iot.ListJobExecutionsForJobInput{
			JobId:      aws.String(args.JobID),
			MaxResults: aws.Int32(maxResults),
		}
		if args.Status != "" {
			input.Status = types.JobExecutionStatus(args.Status)
		}

		out, err := clients.IoT.ListJobExecutionsForJob(ctx, input)
		if err != nil {
			return textResult(fmt.Sprintf("Error listing job executions: %v", err)), nil, nil
		}

		executions := make([]map[string]any, 0, len(out.ExecutionSummaries))
		for _, e := range out.ExecutionSummaries {
			exec := map[string]any{
				"thing_arn": aws.ToString(e.ThingArn),
			}
			if e.JobExecutionSummary != nil {
				exec["status"] = string(e.JobExecutionSummary.Status)
				exec["queued_at"] = e.JobExecutionSummary.QueuedAt
				exec["started_at"] = e.JobExecutionSummary.StartedAt
				exec["last_updated"] = e.JobExecutionSummary.LastUpdatedAt
				exec["execution_number"] = e.JobExecutionSummary.ExecutionNumber
			}
			executions = append(executions, exec)
		}
		return jsonResult(map[string]any{
			"job_id":     args.JobID,
			"executions": executions,
		})
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_job_executions_for_thing",
		Description: "List all job executions for a specific IoT Thing",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args ListJobExecutionsForThingArgs) (*mcp.CallToolResult, any, error) {
		maxResults := args.MaxResults
		if maxResults == 0 {
			maxResults = 25
		}

		input := &iot.ListJobExecutionsForThingInput{
			ThingName:  aws.String(args.ThingName),
			MaxResults: aws.Int32(maxResults),
		}
		if args.Status != "" {
			input.Status = types.JobExecutionStatus(args.Status)
		}

		out, err := clients.IoT.ListJobExecutionsForThing(ctx, input)
		if err != nil {
			return textResult(fmt.Sprintf("Error listing job executions for thing: %v", err)), nil, nil
		}

		executions := make([]map[string]any, 0, len(out.ExecutionSummaries))
		for _, e := range out.ExecutionSummaries {
			exec := map[string]any{
				"job_id": aws.ToString(e.JobId),
			}
			if e.JobExecutionSummary != nil {
				exec["status"] = string(e.JobExecutionSummary.Status)
				exec["queued_at"] = e.JobExecutionSummary.QueuedAt
				exec["started_at"] = e.JobExecutionSummary.StartedAt
				exec["last_updated"] = e.JobExecutionSummary.LastUpdatedAt
				exec["execution_number"] = e.JobExecutionSummary.ExecutionNumber
			}
			executions = append(executions, exec)
		}
		return jsonResult(map[string]any{
			"thing_name": args.ThingName,
			"executions": executions,
		})
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "describe_job_execution",
		Description: "Get detailed information about a specific job execution on a Thing",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args DescribeJobExecutionArgs) (*mcp.CallToolResult, any, error) {
		out, err := clients.IoT.DescribeJobExecution(ctx, &iot.DescribeJobExecutionInput{
			JobId:     aws.String(args.JobID),
			ThingName: aws.String(args.ThingName),
		})
		if err != nil {
			return textResult(fmt.Sprintf("Error describing job execution: %v", err)), nil, nil
		}

		e := out.Execution
		result := map[string]any{
			"job_id":           aws.ToString(e.JobId),
			"thing_name":       aws.ToString(e.ThingArn),
			"status":           string(e.Status),
			"status_details":   e.StatusDetails,
			"queued_at":        e.QueuedAt,
			"started_at":       e.StartedAt,
			"last_updated":     e.LastUpdatedAt,
			"execution_number": e.ExecutionNumber,
			"version_number":   e.VersionNumber,
		}
		return jsonResult(result)
	})
}
