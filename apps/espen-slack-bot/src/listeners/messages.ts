import type { App } from "@slack/bolt";
import { sendToAgent, streamToAgent } from "../agent/a2a-client.js";
import { getConversationId, setConversationId } from "../state/threads.js";
import { formatAgentResponse } from "../formatters/blocks.js";

export function registerMessageListeners(app: App) {
  // Respond to direct messages and app mentions
  app.event("app_mention", async ({ event, client, logger }) => {
    const threadTs = event.thread_ts ?? event.ts;
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (!text) return;

    try {
      // Post a thinking indicator
      const thinking = await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "🔍 Looking into this...",
      });

      // Check if there's an existing conversation for this thread
      const existingConversationId = await getConversationId(threadTs);

      // Call the router agent
      const response = await sendToAgent(text, existingConversationId);

      // Store the conversation mapping for follow-ups
      if (response.conversationId) {
        await setConversationId(threadTs, response.conversationId);
      }

      // Replace thinking message with the actual response
      if (thinking.ts) {
        await client.chat.update({
          channel: event.channel,
          ts: thinking.ts,
          ...formatAgentResponse(response.text),
        });
      }
    } catch (error) {
      logger.error("Error handling message", error);
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "Sorry, I ran into an issue processing your request. Please try again.",
      });
    }
  });

  app.message(async ({ message, client, logger }) => {
    // Only handle DMs (no subtype = regular user message)
    if (message.channel_type !== "im" || message.subtype) return;
    if (!("text" in message) || !message.text) return;

    const threadTs = message.thread_ts ?? message.ts;

    try {
      const thinking = await client.chat.postMessage({
        channel: message.channel,
        thread_ts: threadTs,
        text: "🔍 Looking into this...",
      });

      const existingConversationId = await getConversationId(threadTs);
      const response = await sendToAgent(message.text, existingConversationId);

      if (response.conversationId) {
        await setConversationId(threadTs, response.conversationId);
      }

      if (thinking.ts) {
        await client.chat.update({
          channel: message.channel,
          ts: thinking.ts,
          ...formatAgentResponse(response.text),
        });
      }
    } catch (error) {
      logger.error("Error handling DM", error);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: threadTs,
        text: "Sorry, I ran into an issue processing your request. Please try again.",
      });
    }
  });
}