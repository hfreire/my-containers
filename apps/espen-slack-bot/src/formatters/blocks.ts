interface SlackMessage {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

// Slack mrkdwn section text limit
const SECTION_LIMIT = 3000;

/**
 * Convert standard Markdown to Slack mrkdwn format.
 */
function markdownToMrkdwn(text: string): string {
  return (
    text
      // Headers → bold text
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // Bold: **text** or __text__ → *text*
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/__(.+?)__/g, "*$1*")
      // Italic: *text* (single) is already mrkdwn — but _text_ also works
      // Links: [text](url) → <url|text>
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
      // Images: ![alt](url) → <url|alt>
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "<$2|$1>")
      // Strikethrough: ~~text~~ → ~text~
      .replace(/~~(.+?)~~/g, "~$1~")
      // Horizontal rules
      .replace(/^[-*_]{3,}$/gm, "───")
  );
}

export function formatAgentResponse(text: string): SlackMessage {
  const mrkdwn = markdownToMrkdwn(text);

  // If short enough, use a single section block
  if (mrkdwn.length <= SECTION_LIMIT) {
    return {
      text: mrkdwn,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: mrkdwn },
        },
      ],
    };
  }

  // Split into multiple section blocks to avoid "See more" truncation
  const blocks: Array<Record<string, unknown>> = [];
  let remaining = mrkdwn;

  while (remaining.length > 0) {
    if (remaining.length <= SECTION_LIMIT) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: remaining },
      });
      break;
    }

    // Find a good split point (double newline, then single newline)
    let splitAt = remaining.lastIndexOf("\n\n", SECTION_LIMIT);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", SECTION_LIMIT);
    if (splitAt <= 0) splitAt = SECTION_LIMIT;

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: remaining.slice(0, splitAt) },
    });
    remaining = remaining.slice(splitAt).replace(/^\n+/, "");
  }

  return { text: mrkdwn, blocks };
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
          text: `🔧 *Proposed action:*\n${markdownToMrkdwn(description)}`,
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
