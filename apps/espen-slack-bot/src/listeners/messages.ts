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

    const existingConversationId = await getConversationId(threadTs);
    const response = await sendToAgent(text.trim(), existingConversationId);

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
  // Handle @mentions in channels (starts a new thread or continues one)
  app.event("app_mention", async ({ event, client, logger }) => {
    const threadTs = event.thread_ts ?? event.ts;
    const text = event.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
    await handleUserMessage(text, event.channel, threadTs, client, logger);
  });

  app.message(async ({ message, client, logger, context }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;

    // Handle DMs — always respond
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

    // Handle thread replies in channels — respond if we have an active
    // conversation for this thread (user doesn't need to @mention again)
    if (message.thread_ts) {
      const existingConversationId = await getConversationId(
        message.thread_ts
      );
      if (existingConversationId) {
        // Strip any accidental bot mentions
        const text = message.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
        await handleUserMessage(
          text,
          message.channel,
          message.thread_ts,
          client,
          logger
        );
      }
    }
  });
}
