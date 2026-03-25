import type { App } from "@slack/bolt";
import { sendToAgent } from "../agent/a2a-client.js";
import { getConversationId, setConversationId } from "../state/threads.js";
import { formatAgentResponse } from "../formatters/blocks.js";

async function handleUserMessage(
  text: string,
  channel: string,
  threadTs: string,
  messageTs: string,
  client: any,
  logger: any
) {
  if (!text.trim()) return;

  // React with eyes to indicate we're working on it
  await client.reactions.add({ channel, timestamp: messageTs, name: "eyes" }).catch(() => {});

  try {
    const tz = process.env.TZ ?? "UTC";
    const now = new Date().toLocaleString("sv-SE", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    });
    const prompt = `[Current time: ${now} (${tz})]\n\n${text.trim()}`;

    const contextId = await getConversationId(threadTs);
    const response = await sendToAgent(prompt, contextId);

    if (response.conversationId) {
      await setConversationId(threadTs, response.conversationId);
    }

    // Agent signals the message wasn't meant for it
    if (response.text.trim() === "[SKIP]") {
      await client.reactions.remove({ channel, timestamp: messageTs, name: "eyes" }).catch(() => {});
      return;
    }

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      ...formatAgentResponse(response.text),
    });

    // Replace eyes with green check
    await client.reactions.remove({ channel, timestamp: messageTs, name: "eyes" }).catch(() => {});
    await client.reactions.add({ channel, timestamp: messageTs, name: "white_check_mark" }).catch(() => {});
  } catch (error) {
    logger.error("Error handling message", error);

    // Replace eyes with red cross
    await client.reactions.remove({ channel, timestamp: messageTs, name: "eyes" }).catch(() => {});
    await client.reactions.add({ channel, timestamp: messageTs, name: "x" }).catch(() => {});

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
    await handleUserMessage(text, event.channel, threadTs, event.ts, client, logger);
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
        message.ts,
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
          message.ts,
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
            message.ts,
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
