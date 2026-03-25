interface SlackMessage {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

export function formatAgentResponse(text: string): SlackMessage {
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
    ],
  };
}

export function formatApprovalRequest(
  description: string,
  details: string
): SlackMessage {
  return {
    text: `🔧 Proposed action: ${description}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔧 *Proposed action:*\n${description}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`${details}\`\`\``,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve" },
            style: "primary",
            action_id: "approve_action",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "❌ Deny" },
            style: "danger",
            action_id: "deny_action",
          },
        ],
      },
    ],
  };
}
