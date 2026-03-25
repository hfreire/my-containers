import type { App } from "@slack/bolt";
import { sendToAgent } from "../agent/a2a-client.js";
import { getConversationId } from "../state/threads.js";
import { formatAgentResponse } from "../formatters/blocks.js";

export function registerActionListeners(app: App) {
  app.action("approve_action", async ({ ack, body, client, logger }) => {
    await ack();

    if (body.type !== "block_actions" || !body.message) return;

    const threadTs = body.message.thread_ts ?? body.message.ts;
    const channel = body.channel?.id;
    if (!channel || !threadTs) return;

    try {
      const conversationId = await getConversationId(threadTs);

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "✅ Action approved. Executing...",
      });

      const response = await sendToAgent(
        "User approved the proposed action. Please execute it.",
        conversationId
      );

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        ...formatAgentResponse(response.text),
      });
    } catch (error) {
      logger.error("Error executing approved action", error);
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "Sorry, I ran into an issue executing the action.",
      });
    }
  });

  app.action("deny_action", async ({ ack, body, client }) => {
    await ack();

    if (body.type !== "block_actions" || !body.message) return;

    const channel = body.channel?.id;
    const threadTs = body.message.thread_ts ?? body.message.ts;
    if (!channel || !threadTs) return;

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "❌ Action cancelled.",
    });
  });
}