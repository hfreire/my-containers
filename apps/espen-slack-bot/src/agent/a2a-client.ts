export interface AgentResponse {
  text: string;
  conversationId?: string;
}

const A2A_BASE_URL =
  process.env.A2A_BASE_URL ??
  "http://kagent-controller.ai:8083/api/a2a";
const AGENT_NAMESPACE = process.env.AGENT_NAMESPACE ?? "default";
const AGENT_NAME =
  process.env.AGENT_NAME ?? "espen-support-router-agent";
const A2A_TIMEOUT = parseInt(process.env.A2A_TIMEOUT ?? "120000", 10);

interface A2APart {
  kind: string;
  text?: string;
}

interface A2ARequest {
  jsonrpc: "2.0";
  id: string;
  method: "message/send";
  params: {
    message: {
      role: "user";
      parts: Array<{ kind: "text"; text: string }>;
    };
    contextId?: string;
  };
}

interface A2AResponse {
  jsonrpc: "2.0";
  id: string;
  result?: {
    artifacts?: Array<{ parts: A2APart[] }>;
    contextId?: string;
    status?: {
      state: string;
      message?: {
        parts: A2APart[];
      };
    };
    history?: Array<{
      role: string;
      parts: A2APart[];
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export async function sendToAgent(
  text: string,
  conversationId?: string
): Promise<AgentResponse> {
  const url = `${A2A_BASE_URL}/${AGENT_NAMESPACE}/${AGENT_NAME}`;
  const requestId = crypto.randomUUID();

  const body: A2ARequest = {
    jsonrpc: "2.0",
    id: requestId,
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [{ kind: "text", text }],
      },
    },
  };

  if (conversationId) {
    body.params.contextId = conversationId;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(A2A_TIMEOUT),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `A2A request failed: ${response.status} ${response.statusText} ${body}`
    );
  }

  const data = (await response.json()) as A2AResponse;

  if (data.error) {
    throw new Error(`A2A error: ${data.error.message}`);
  }

  const responseText = extractText(data);

  return {
    text: responseText || "No response from agent.",
    conversationId: data.result?.contextId,
  };
}

function extractText(data: A2AResponse): string {
  // Try artifacts first (kagent format)
  const artifacts = data.result?.artifacts ?? [];
  for (const artifact of artifacts) {
    const texts = artifact.parts
      .filter((p) => p.kind === "text" && p.text)
      .map((p) => p.text!);
    if (texts.length > 0) return texts.join("\n");
  }

  // Fall back to status.message.parts (standard A2A)
  const parts = data.result?.status?.message?.parts ?? [];
  const texts = parts
    .filter((p) => p.kind === "text" && p.text)
    .map((p) => p.text!);
  if (texts.length > 0) return texts.join("\n");

  // Fall back to last agent message in history
  const history = data.result?.history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "agent") {
      const agentTexts = history[i].parts
        .filter((p) => p.kind === "text" && p.text)
        .map((p) => p.text!);
      if (agentTexts.length > 0) return agentTexts.join("\n");
    }
  }

  return "";
}

export async function streamToAgent(
  text: string,
  conversationId: string | undefined,
  onChunk: (text: string) => void
): Promise<AgentResponse> {
  const url = `${A2A_BASE_URL}/${AGENT_NAMESPACE}/${AGENT_NAME}`;
  const requestId = crypto.randomUUID();

  const body = {
    jsonrpc: "2.0",
    id: requestId,
    method: "message/stream",
    params: {
      message: {
        role: "user",
        parts: [{ kind: "text", text }],
      },
      ...(conversationId && {
        configuration: { conversationId },
      }),
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(A2A_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(
      `A2A stream request failed: ${response.status} ${response.statusText}`
    );
  }

  let fullText = "";
  let resultConversationId: string | undefined;

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        const parts = event.result?.status?.message?.parts ?? [];
        for (const part of parts) {
          if (part.kind === "text" && part.text) {
            fullText += part.text;
            onChunk(part.text);
          }
        }
        if (event.result?.conversationId) {
          resultConversationId = event.result.conversationId;
        }
      } catch {
        // Skip malformed SSE data
      }
    }
  }

  return {
    text: fullText || "No response from agent.",
    conversationId: resultConversationId,
  };
}