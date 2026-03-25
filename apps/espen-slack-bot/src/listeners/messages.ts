import type { App } from "@slack/bolt";
import { sendToAgent } from "../agent/a2a-client.js";
import { formatAgentResponse } from "../formatters/blocks.js";

async function getThreadHistory(
  client: any,
  channel: string,
  threadTs: string,
  botUserId: string
): Promise<string> {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 50,
    });

    const messages = result.messages ?? [];
    if (messages.length <= 1) return "";

    // Build conversation history (skip the latest message — that's the current one)
    const history = messages
      .slice(0, -1)
      .map((msg: any) => {
        const role = msg.user === botUserId ? "assistant" : "user";
        const text = (msg.text ?? "")
          .replace(/<@[A-Z0-9]+>/gi, "")
          .trim();
        if (!text) return null;
        return `[${role}]: ${text}`;
      })
      .filter(Boolean);

    if (history.length === 0) return "";

    return (
      "<conversation_history>\n" +
      history.join("\n") +
      "\n</conversation_history>\n\n"
    );
  } catch {
    return "";
  }
}

async function handleUserMessage(
  text: string,
  channel: string,
  threadTs: string,
  isThread: boolean,
  client: any,
  logger: any,
  botUserId: string
) {
  if (!text.trim()) return;

  try {
    const thinking = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "🔍 Looking into this...",
    });

    // For thread follow-ups, prepend conversation history
    let prompt = text.trim();
    if (isThread) {
      const history = await getThreadHistory(
        client,
        channel,
        threadTs,
        botUserId
      );
      if (history) {
        prompt = history + prompt;
      }
    }

    const response = await sendToAgent(prompt);

    if (thinking.ts) {
      await client.chat.update({
        channel,
        ts: thinking.ts,
        ...formatAgentResponse(response.text),
      });
    }
  } catch (error) {
    logger.error("Error handling message", error);
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Sorry, I ran into an issue processing your request. Please try again.",
    });
  }
}

export function registerMessageListeners(app: App) {
  let botUserId = "";

  // Resolve bot user ID on first event
  async function getBotUserId(client: any): Promise<string> {
    if (botUserId) return botUserId;
    try {
      const result = await client.auth.test();
      botUserId = result.user_id ?? "";
    } catch {
      // ignore
    }
    return botUserId;
  }

  // Handle @mentions in channels
  app.event("app_mention", async ({ event, client, logger }) => {
    const threadTs = event.thread_ts ?? event.ts;
    const text = event.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
    const uid = await getBotUserId(client);
    const isThread = !!event.thread_ts;
    await handleUserMessage(
      text,
      event.channel,
      threadTs,
      isThread,
      client,
      logger,
      uid
    );
  });

  app.message(async ({ message, client, logger }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;

    const uid = await getBotUserId(client);

    // Handle DMs
    if (message.channel_type === "im") {
      const threadTs = message.thread_ts ?? message.ts;
      const isThread = !!message.thread_ts;
      await handleUserMessage(
        message.text,
        message.channel,
        threadTs,
        isThread,
        client,
        logger,
        uid
      );
      return;
    }

    // Handle thread replies in channels where bot previously responded
    if (message.thread_ts) {
      // Check if bot has replied in this thread
      try {
        const replies = await client.conversations.replies({
          channel: message.channel,
          ts: message.thread_ts,
          limit: 50,
        });
        const botReplied = (replies.messages ?? []).some(
          (m: any) => m.user === uid
        );
        if (botReplied) {
          const text = message.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
          await handleUserMessage(
            text,
            message.channel,
            message.thread_ts,
            true,
            client,
            logger,
            uid
          );
        }
      } catch {
        // Can't read thread — ignore
      }
    }
  });
}
