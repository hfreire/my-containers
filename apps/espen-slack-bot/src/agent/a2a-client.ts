export interface AgentUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AgentResponse {
  text: string;
  conversationId?: string;
  usage?: AgentUsage;
}

const A2A_BASE_URL =
  process.env.A2A_BASE_URL ??
  "http://kagent-controller.ai:8083/api/a2a";
const KAGENT_API_BASE_URL =
  process.env.KAGENT_API_BASE_URL ??
  A2A_BASE_URL.replace(/\/api\/a2a$/, "/api");
const AGENT_NAMESPACE = process.env.AGENT_NAMESPACE ?? "default";
const AGENT_NAME =
  process.env.AGENT_NAME ?? "espen-support-router-agent";
const A2A_TIMEOUT = parseInt(process.env.A2A_TIMEOUT ?? "120000", 10);

interface A2APart {
  kind: string;
  text?: string;
}

interface A2AMessage {
  role: "user" | "agent";
  parts: A2APart[];
  messageId?: string;
  contextId?: string;
  taskId?: string;
}

interface A2ARequest {
  jsonrpc: "2.0";
  id: string;
  method: "message/send" | "message/stream";
  params: {
    message: A2AMessage;
    configuration?: {
      blocking?: boolean;
    };
    metadata?: Record<string, unknown>;
  };
}

// A2A v0.3.0: response result can be a Task (kind: "task") or Message (kind: "message")
interface A2ATaskResult {
  kind: "task";
  id: string;
  contextId?: string;
  status?: {
    state: string;
    timestamp?: string;
    message?: A2AMessage;
  };
  artifacts?: Array<{
    artifactId?: string;
    parts: A2APart[];
  }>;
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
}

interface A2AMessageResult {
  kind: "message";
  messageId?: string;
  contextId?: string;
  role: "agent";
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

interface A2AResponse {
  jsonrpc: "2.0";
  id: string;
  result?: A2ATaskResult | A2AMessageResult;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export async function sendToAgent(
  text: string,
  contextId?: string
): Promise<AgentResponse> {
  const url = `${A2A_BASE_URL}/${AGENT_NAMESPACE}/${AGENT_NAME}/`;
  const requestId = crypto.randomUUID();

  const message: A2AMessage = {
    role: "user",
    messageId: crypto.randomUUID(),
    parts: [{ kind: "text", text }],
  };

  if (contextId) {
    message.contextId = contextId;
  }

  const body: A2ARequest = {
    jsonrpc: "2.0",
    id: requestId,
    method: "message/send",
    params: {
      message,
      configuration: { blocking: true },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(A2A_TIMEOUT),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `A2A request failed: ${response.status} ${response.statusText} ${responseBody}`
    );
  }

  const data = (await response.json()) as A2AResponse;

  if (data.error) {
    throw new Error(`A2A error: ${data.error.message}`);
  }

  // Extract session ID for aggregated usage query
  const sessionId = (data.result?.metadata as Record<string, unknown>)
    ?.kagent_session_id as string | undefined;
  const usage = await fetchSessionUsage(sessionId);

  return {
    text: extractText(data) || "No response from agent.",
    conversationId: data.result?.contextId,
    usage,
  };
}

function extractText(data: A2AResponse): string {
  const result = data.result;
  if (!result) return "";

  // A2A v0.3.0: handle Message result directly (kind: "message")
  if (result.kind === "message") {
    const msg = result as A2AMessageResult;
    return extractPartsText(msg.parts);
  }

  // A2A v0.3.0: handle Task result (kind: "task")
  if (result.kind === "task") {
    const task = result as A2ATaskResult;

    // Try artifacts first
    for (const artifact of task.artifacts ?? []) {
      const text = extractPartsText(artifact.parts);
      if (text) return text;
    }

    // Try status message
    if (task.status?.message) {
      const text = extractPartsText(task.status.message.parts);
      if (text) return text;
    }

    // Fall back to last agent message in history
    for (let i = (task.history ?? []).length - 1; i >= 0; i--) {
      if (task.history![i].role === "agent") {
        const text = extractPartsText(task.history![i].parts);
        if (text) return text;
      }
    }
  }

  // Fallback for responses without kind field (pre-v0.3.0 compat)
  const anyResult = result as any;
  for (const artifact of anyResult.artifacts ?? []) {
    const text = extractPartsText(artifact.parts ?? []);
    if (text) return text;
  }
  if (anyResult.parts) {
    const text = extractPartsText(anyResult.parts);
    if (text) return text;
  }

  return "";
}

function extractPartsText(parts: A2APart[]): string {
  return parts
    .filter((p) => p.kind === "text" && p.text)
    .map((p) => p.text!)
    .join("\n");
}

/**
 * Fetch aggregated token usage across all tasks in a session (router + specialists).
 * Uses the kagent controller REST API: GET /api/sessions/{id}/tasks
 *
 * Usage is found in two places:
 * 1. History message metadata.kagent_usage_metadata — each agent LLM turn
 * 2. History function_response parts: data.response.kagent_usage_metadata — sub-agent totals
 */
async function fetchSessionUsage(
  sessionId: string | undefined
): Promise<AgentUsage | undefined> {
  if (!sessionId) return undefined;

  try {
    const res = await fetch(
      `${KAGENT_API_BASE_URL}/sessions/${sessionId}/tasks`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return undefined;

    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const tasks = body.data ?? [];

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let found = false;

    for (const task of tasks) {
      const history = (task.history as Array<Record<string, unknown>>) ?? [];

      for (const msg of history) {
        // 1. Agent turn usage (on message metadata)
        const meta = msg.metadata as Record<string, unknown> | undefined;
        const msgUsage = meta?.kagent_usage_metadata as
          | Record<string, unknown>
          | undefined;
        if (msgUsage) {
          found = true;
          addUsage(msgUsage);
        }

        // 2. Sub-agent usage (in function_response parts)
        const parts = (msg.parts as Array<Record<string, unknown>>) ?? [];
        for (const part of parts) {
          const partMeta = part.metadata as Record<string, unknown> | undefined;
          if (partMeta?.kagent_type !== "function_response") continue;

          const data = part.data as Record<string, unknown> | undefined;
          const response = data?.response as Record<string, unknown> | undefined;
          const subUsage = response?.kagent_usage_metadata as
            | Record<string, unknown>
            | undefined;
          if (subUsage) {
            found = true;
            addUsage(subUsage);
          }
        }
      }
    }

    function addUsage(usage: Record<string, unknown>) {
      if (typeof usage.promptTokenCount === "number")
        promptTokens += usage.promptTokenCount;
      if (typeof usage.candidatesTokenCount === "number")
        completionTokens += usage.candidatesTokenCount;
      if (typeof usage.totalTokenCount === "number")
        totalTokens += usage.totalTokenCount;
    }

    if (!found) return undefined;

    return {
      promptTokens: promptTokens || undefined,
      completionTokens: completionTokens || undefined,
      totalTokens: totalTokens || undefined,
    };
  } catch {
    // Non-fatal — fall back to no usage data
    return undefined;
  }
}

export async function streamToAgent(
  text: string,
  contextId: string | undefined,
  onChunk: (text: string) => void
): Promise<AgentResponse> {
  const url = `${A2A_BASE_URL}/${AGENT_NAMESPACE}/${AGENT_NAME}/`;
  const requestId = crypto.randomUUID();

  const message: A2AMessage = {
    role: "user",
    messageId: crypto.randomUUID(),
    parts: [{ kind: "text", text }],
  };

  if (contextId) {
    message.contextId = contextId;
  }

  const body: A2ARequest = {
    jsonrpc: "2.0",
    id: requestId,
    method: "message/stream",
    params: { message },
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
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `A2A stream request failed: ${response.status} ${response.statusText} ${responseBody}`
    );
  }

  let fullText = "";
  let resultContextId: string | undefined;

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
      const eventData = line.slice(6);
      if (eventData === "[DONE]") continue;

      try {
        const event = JSON.parse(eventData) as A2AResponse;
        const text = extractText(event);
        if (text) {
          fullText += text;
          onChunk(text);
        }
        if (event.result?.contextId) {
          resultContextId = event.result.contextId;
        }
      } catch {
        // Skip malformed SSE data
      }
    }
  }

  return {
    text: fullText || "No response from agent.",
    conversationId: resultContextId,
  };
}
