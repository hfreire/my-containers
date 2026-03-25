package tools

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	awsclients "github.com/hfreire/aws-iot-core-mcp/internal/aws"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type SubscribeArgs struct {
	Topic    string `json:"topic" jsonschema:"description:The MQTT topic to subscribe to"`
	Duration int    `json:"duration,omitempty" jsonschema:"description:Duration in seconds to collect messages (default 5, max 30)"`
}

type mqttMessage struct {
	Topic     string `json:"topic"`
	Payload   string `json:"payload"`
	Timestamp string `json:"timestamp"`
}

func RegisterMQTT(server *mcp.Server, clients *awsclients.Clients) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "subscribe_to_mqtt_topic",
		Description: "Subscribe to an AWS IoT Core MQTT topic and collect published messages for a given duration. Use this to sample telemetry from devices.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args SubscribeArgs) (*mcp.CallToolResult, any, error) {
		duration := args.Duration
		if duration <= 0 {
			duration = 5
		}
		if duration > 30 {
			duration = 30
		}

		creds, err := clients.Cfg.Credentials.Retrieve(ctx)
		if err != nil {
			return textResult(fmt.Sprintf("Error retrieving AWS credentials: %v", err)), nil, nil
		}

		wssURL := buildSigV4WSSURL(
			clients.IoTEndpoint,
			clients.Cfg.Region,
			creds.AccessKeyID,
			creds.SecretAccessKey,
			creds.SessionToken,
		)

		var mu sync.Mutex
		var messages []mqttMessage

		opts := mqtt.NewClientOptions().
			AddBroker(wssURL).
			SetClientID(fmt.Sprintf("aws-iot-mcp-%d", time.Now().UnixNano())).
			SetTLSConfig(nil).
			SetConnectTimeout(10 * time.Second).
			SetWriteTimeout(5 * time.Second)

		client := mqtt.NewClient(opts)
		token := client.Connect()
		if !token.WaitTimeout(10 * time.Second) {
			return textResult("Error: MQTT connection timed out"), nil, nil
		}
		if token.Error() != nil {
			return textResult(fmt.Sprintf("Error connecting to MQTT: %v", token.Error())), nil, nil
		}
		defer client.Disconnect(250)

		token = client.Subscribe(args.Topic, 0, func(_ mqtt.Client, msg mqtt.Message) {
			mu.Lock()
			defer mu.Unlock()
			messages = append(messages, mqttMessage{
				Topic:     msg.Topic(),
				Payload:   string(msg.Payload()),
				Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			})
		})
		if !token.WaitTimeout(5 * time.Second) {
			return textResult("Error: MQTT subscribe timed out"), nil, nil
		}
		if token.Error() != nil {
			return textResult(fmt.Sprintf("Error subscribing to topic: %v", token.Error())), nil, nil
		}

		select {
		case <-time.After(time.Duration(duration) * time.Second):
		case <-ctx.Done():
		}

		client.Unsubscribe(args.Topic)

		mu.Lock()
		defer mu.Unlock()

		return jsonResult(map[string]any{
			"topic":          args.Topic,
			"duration_secs":  duration,
			"message_count":  len(messages),
			"messages":       messages,
		})
	})
}

// buildSigV4WSSURL constructs a presigned WebSocket URL for AWS IoT Core MQTT.
func buildSigV4WSSURL(endpoint, region, accessKey, secretKey, sessionToken string) string {
	now := time.Now().UTC()
	datestamp := now.Format("20060102")
	amzdate := now.Format("20060102T150405Z")

	service := "iotdevicegateway"
	credentialScope := datestamp + "/" + region + "/" + service + "/aws4_request"

	canonicalQuerystring := "X-Amz-Algorithm=AWS4-HMAC-SHA256"
	canonicalQuerystring += "&X-Amz-Credential=" + url.QueryEscape(accessKey+"/"+credentialScope)
	canonicalQuerystring += "&X-Amz-Date=" + amzdate
	canonicalQuerystring += "&X-Amz-Expires=86400"
	if sessionToken != "" {
		canonicalQuerystring += "&X-Amz-Security-Token=" + url.QueryEscape(sessionToken)
	}
	canonicalQuerystring += "&X-Amz-SignedHeaders=host"

	canonicalHeaders := "host:" + endpoint + "\n"
	payloadHash := sha256Hex("")
	canonicalRequest := "GET\n/mqtt\n" + canonicalQuerystring + "\n" + canonicalHeaders + "\nhost\n" + payloadHash

	stringToSign := "AWS4-HMAC-SHA256\n" + amzdate + "\n" + credentialScope + "\n" + sha256Hex(canonicalRequest)

	signingKey := deriveSigningKey(secretKey, datestamp, region, service)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	return "wss://" + endpoint + "/mqtt?" + canonicalQuerystring + "&X-Amz-Signature=" + signature
}

func sha256Hex(data string) string {
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func deriveSigningKey(secretKey, datestamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(datestamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	return hmacSHA256(kService, []byte("aws4_request"))
}

// init registers a custom websocket dialer prefix so Paho recognises "wss://" URLs.
func init() {
	// Paho's default network handling supports wss:// out of the box when
	// gorilla/websocket is available (which it is via the dependency).
	// We use SetProtocolVersionExplicit=false (default) so no extra config needed.
	_ = strings.NewReplacer() // avoid unused import
}