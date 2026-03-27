import type { App } from "@slack/bolt";
import { sendToAgent } from "../agent/a2a-client.js";
import { getConversationId, getMessageData } from "../state/threads.js";
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

  app.action("show_sources", async ({ ack, body, client, logger }) => {
    await ack();

    if (body.type !== "block_actions" || !body.message) return;

    const channel = body.channel?.id;
    const messageTs = body.message.ts;
    if (!channel || !messageTs) return;

    try {
      const data = await getMessageData(messageTs);
      if (!data) return;

      // Update the message with sources expanded, preserving stats
      await client.chat.update({
        channel,
        ts: messageTs,
        ...formatAgentResponse(data.answer, {
          sources: data.sources,
          expandSources: true,
          stats: data.stats as any,
        }),
      });
    } catch (error) {
      logger.error("Error showing sources", error);
    }
  });

  app.action("response_feedback", async ({ ack, body, client, logger }) => {
    await ack();

    if (body.type !== "block_actions" || !body.actions?.[0]) return;

    const action = body.actions[0] as any;
    const feedback = action.value as string; // "positive" or "negative"
    const userId = body.user?.id;
    const channel = body.channel?.id;
    const messageTs = body.message?.ts;
    const threadTs = (body.message as any)?.thread_ts ?? messageTs;

    let permalink: string | undefined;
    if (channel && threadTs) {
      try {
        const res = await client.chat.getPermalink({
          channel,
          message_ts: threadTs,
        });
        permalink = res.permalink;
      } catch {
        // Non-fatal
      }
    }

    console.log(
      JSON.stringify({
        event: "response_feedback",
        feedback,
        userId,
        channel,
        messageTs,
        threadTs,
        permalink,
        timestamp: new Date().toISOString(),
      })
    );
  });
}