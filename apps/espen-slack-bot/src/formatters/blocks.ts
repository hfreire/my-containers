interface SlackMessage {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

// Slack mrkdwn section text limit
const SECTION_LIMIT = 3000;

/**
 * Convert a Markdown table to a Slack-friendly list format.
 * Markdown tables are not supported in Slack mrkdwn.
 */
function convertTable(table: string): string {
  const lines = table.trim().split("\n");
  // Parse header row
  const headers = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);

  // Skip separator row (line 1), parse data rows
  const rows = lines.slice(2).map((line) =>
    line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
  );

  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const header = headers[i];
          if (!header || !cell) return null;
          return `• *${header}:* ${cell}`;
        })
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

/**
 * Convert standard Markdown to Slack mrkdwn format.
 */
function markdownToMrkdwn(text: string): string {
  // Convert tables first (multi-line)
  text = text.replace(
    /^\|.+\|$\n^\|[-| :]+\|$\n(?:^\|.+\|$\n?)+/gm,
    (match) => convertTable(match)
  );

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

  // Send as plain text only — no blocks.
  // Slack renders mrkdwn in the text field without truncation or "See more".
  return { text: mrkdwn };
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
