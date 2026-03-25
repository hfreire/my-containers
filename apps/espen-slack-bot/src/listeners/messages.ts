import type { App } from "@slack/bolt";
import { sendToAgent } from "../agent/a2a-client.js";
import { getConversationId, setConversationId } from "../state/threads.js";
import { formatAgentResponse } from "../formatters/blocks.js";

async function handleUserMessage(
  text: string,
  channel: string,
  threadTs: string,
  client: any,
  logger: any
) {
  if (!text.trim()) return;

  try {
    const thinking = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "🔍 Looking into this...",
    });

    // Look up existing contextId for this thread
    const contextId = await getConversationId(threadTs);

    const response = await sendToAgent(text.trim(), contextId);

    // Store contextId for follow-ups
    if (response.conversationId) {
      await setConversationId(threadTs, response.conversationId);
    }

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
    await handleUserMessage(text, event.channel, threadTs, client, logger);
  });

  app.message(async ({ message, client, logger }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;

    const uid = await getBotUserId(client);

    // Handle DMs
    if (message.channel_type === "im") {
      const threadTs = message.thread_ts ?? message.ts;
      await handleUserMessage(
        message.text,
        message.channel,
        threadTs,
        client,
        logger
      );
      return;
    }

    // Handle thread replies in channels where bot previously responded
    if (message.thread_ts) {
      // Fast check: if we have a contextId stored, bot was in this thread
      const contextId = await getConversationId(message.thread_ts);
      if (contextId) {
        const text = message.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
        await handleUserMessage(
          text,
          message.channel,
          message.thread_ts,
          client,
          logger
        );
        return;
      }

      // Fallback: check Slack thread for bot replies
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
            client,
            logger
          );
        }
      } catch {
        // Can't read thread — ignore
      }
    }
  });
}
