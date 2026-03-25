package aws

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/iot"
	"github.com/aws/aws-sdk-go-v2/service/iotdataplane"
)

type Clients struct {
	IoT          *iot.Client
	IoTDataPlane *iotdataplane.Client
	Cfg          aws.Config
	IoTEndpoint  string
}

func NewClients(ctx context.Context) (*Clients, error) {
	loadEnvFromSecretMount()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}

	iotClient := iot.NewFromConfig(cfg)

	ep, err := iotClient.DescribeEndpoint(ctx, &iot.DescribeEndpointInput{
		EndpointType: aws.String("iot:Data-ATS"),
	})
	if err != nil {
		return nil, fmt.Errorf("describe IoT data endpoint: %w", err)
	}

	dpClient := iotdataplane.NewFromConfig(cfg, func(o *iotdataplane.Options) {
		o.BaseEndpoint = aws.String("https://" + *ep.EndpointAddress)
	})

	return &Clients{
		IoT:          iotClient,
		IoTDataPlane: dpClient,
		Cfg:          cfg,
		IoTEndpoint:  *ep.EndpointAddress,
	}, nil
}

// loadEnvFromSecretMount reads AWS credentials from kagent's secretRefs volume
// mounts. Secrets are mounted at /mnt/secrets/<secret-name>/<key> as files.
// Each file's name becomes the env var key and its content the value.
func loadEnvFromSecretMount() {
	const secretsDir = "/mnt/secrets"
	entries, err := os.ReadDir(secretsDir)
	if err != nil {
		return
	}
	for _, secretDir := range entries {
		if !secretDir.IsDir() {
			continue
		}
		keys, err := os.ReadDir(secretsDir + "/" + secretDir.Name())
		if err != nil {
			continue
		}
		for _, key := range keys {
			if key.IsDir() {
				continue
			}
			val, err := os.ReadFile(secretsDir + "/" + secretDir.Name() + "/" + key.Name())
			if err != nil {
				continue
			}
			if os.Getenv(key.Name()) == "" {
				os.Setenv(key.Name(), strings.TrimSpace(string(val)))
			}
		}
	}
}

// staticCredentials returns a credential provider from env vars if set.
func staticCredentials() credentials.StaticCredentialsProvider {
	return credentials.NewStaticCredentialsProvider(
		os.Getenv("AWS_ACCESS_KEY_ID"),
		os.Getenv("AWS_SECRET_ACCESS_KEY"),
		os.Getenv("AWS_SESSION_TOKEN"),
	)
}
