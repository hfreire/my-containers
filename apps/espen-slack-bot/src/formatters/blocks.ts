interface SlackMessage {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

// --- Inline element types for rich_text blocks ---

interface TextElement {
  type: "text";
  text: string;
  style?: { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean };
}

interface LinkElement {
  type: "link";
  url: string;
  text?: string;
  style?: { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean };
}

type InlineElement = TextElement | LinkElement;

// --- Inline markdown parser → rich_text elements ---

function parseInline(text: string): InlineElement[] {
  const elements: InlineElement[] = [];
  // Order: bold (**) before italic (*), images before links
  const pattern =
    /\*\*(.+?)\*\*|~~(.+?)~~|`([^`\n]+)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*([^*\n]+)\*/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[1] != null) {
      // **bold**
      elements.push({ type: "text", text: match[1], style: { bold: true } });
    } else if (match[2] != null) {
      // ~~strike~~
      elements.push({ type: "text", text: match[2], style: { strike: true } });
    } else if (match[3] != null) {
      // `code`
      elements.push({ type: "text", text: match[3], style: { code: true } });
    } else if (match[4] != null) {
      // ![alt](url) → link
      elements.push({ type: "link", url: match[5], text: match[4] || match[5] });
    } else if (match[6] != null) {
      // [text](url)
      elements.push({ type: "link", url: match[7], text: match[6] });
    } else if (match[8] != null) {
      // *italic*
      elements.push({ type: "text", text: match[8], style: { italic: true } });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push({ type: "text", text: text.slice(lastIndex) });
  }

  return elements.length > 0 ? elements : [{ type: "text", text }];
}

// --- Block-level tokenizer ---

type BlockToken =
  | { type: "header"; text: string }
  | { type: "divider" }
  | { type: "paragraph"; text: string }
  | { type: "code_block"; code: string }
  | { type: "blockquote"; text: string }
  | { type: "unordered_list"; items: string[] }
  | { type: "ordered_list"; items: string[] }
  | { type: "table"; raw: string };

function tokenize(markdown: string): BlockToken[] {
  const lines = markdown.split("\n");
  const tokens: BlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      i++; // skip opening ```
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      tokens.push({ type: "code_block", code: codeLines.join("\n") });
      continue;
    }

    // Header
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      tokens.push({ type: "header", text: headerMatch[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      tokens.push({ type: "divider" });
      i++;
      continue;
    }

    // Table (line starts with | and next line is a separator)
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      /^\|[-| :]+\|$/.test(lines[i + 1].trim())
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      tokens.push({ type: "table", raw: tableLines.join("\n") });
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      tokens.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ""));
        i++;
      }
      tokens.push({ type: "unordered_list", items });
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s/, ""));
        i++;
      }
      tokens.push({ type: "ordered_list", items });
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].match(/^#{1,6}\s/) &&
      !/^[-*_]{3,}$/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">") &&
      !/^[\s]*[-*+]\s/.test(lines[i]) &&
      !/^[\s]*\d+\.\s/.test(lines[i]) &&
      !(
        lines[i].trim().startsWith("|") &&
        i + 1 < lines.length &&
        /^\|[-| :]+\|$/.test((lines[i + 1] || "").trim())
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return tokens;
}

// --- Table → rich_text list (since Slack doesn't render markdown tables) ---

function tableToRichTextElements(raw: string): Array<Record<string, unknown>> {
  const lines = raw.trim().split("\n");
  const headers = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);

  const rows = lines.slice(2).map((line) =>
    line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
  );

  return [
    {
      type: "rich_text_list",
      style: "bullet",
      elements: rows.map((row) => {
        const parts: InlineElement[] = [];
        row.forEach((cell, i) => {
          if (!headers[i] || !cell) return;
          if (parts.length > 0) parts.push({ type: "text", text: "  ·  " });
          parts.push({
            type: "text",
            text: headers[i] + ": ",
            style: { bold: true },
          });
          parts.push(...parseInline(cell));
        });
        return { type: "rich_text_section", elements: parts };
      }),
    },
  ];
}

// --- Token → Slack Block Kit blocks ---

function tokensToBlocks(tokens: BlockToken[]): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  let richTextElements: Array<Record<string, unknown>> = [];

  function flushRichText() {
    if (richTextElements.length > 0) {
      blocks.push({ type: "rich_text", elements: [...richTextElements] });
      richTextElements = [];
    }
  }

  for (const token of tokens) {
    switch (token.type) {
      case "header": {
        flushRichText();
        // Strip inline formatting for plain_text header block
        const plain = token.text
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/__/g, "")
          .replace(/_/g, "");
        if (plain.length <= 150) {
          blocks.push({
            type: "header",
            text: { type: "plain_text", text: plain, emoji: true },
          });
        } else {
          // Fallback: bold in rich_text for long headers
          richTextElements.push({
            type: "rich_text_section",
            elements: [{ type: "text", text: plain, style: { bold: true } }],
          });
        }
        break;
      }

      case "divider":
        flushRichText();
        blocks.push({ type: "divider" });
        break;

      case "code_block":
        richTextElements.push({
          type: "rich_text_preformatted",
          elements: [{ type: "text", text: token.code }],
        });
        break;

      case "blockquote":
        richTextElements.push({
          type: "rich_text_quote",
          elements: parseInline(token.text),
        });
        break;

      case "unordered_list":
        richTextElements.push({
          type: "rich_text_list",
          style: "bullet",
          elements: token.items.map((item) => ({
            type: "rich_text_section",
            elements: parseInline(item),
          })),
        });
        break;

      case "ordered_list":
        richTextElements.push({
          type: "rich_text_list",
          style: "ordered",
          elements: token.items.map((item) => ({
            type: "rich_text_section",
            elements: parseInline(item),
          })),
        });
        break;

      case "table":
        richTextElements.push(...tableToRichTextElements(token.raw));
        break;

      case "paragraph":
        richTextElements.push({
          type: "rich_text_section",
          elements: parseInline(token.text),
        });
        break;
    }
  }

  flushRichText();
  return blocks;
}

// --- Markdown → Slack mrkdwn (plain text fallback for notifications) ---

function convertTable(table: string): string {
  const lines = table.trim().split("\n");
  const headers = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);

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
      // Bold: **text** or __text__ → *text* (including multi-line)
      .replace(/\*\*([\s\S]+?)\*\*/g, "*$1*")
      .replace(/__([\s\S]+?)__/g, "*$1*")
      // Links: [text](url) → <url|text>
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
      // Images: ![alt](url) → <url|alt>
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "<$2|$1>")
      // Strikethrough: ~~text~~ → ~text~
      .replace(/~~([\s\S]+?)~~/g, "~$1~")
      // Horizontal rules
      .replace(/^[-*_]{3,}$/gm, "───")
  );
}

// --- Public API ---

export interface ResponseStats {
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export function formatAgentResponse(
  text: string,
  options?: {
    sources?: string;
    expandSources?: boolean;
    stats?: ResponseStats;
  }
): SlackMessage {
  const blocks = tokensToBlocks(tokenize(text));
  const sources = options?.sources;
  const expandSources = options?.expandSources ?? false;
  const stats = options?.stats;

  if (sources && expandSources) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: ":clipboard:  *Sources*" }],
    });

    // Parse "name: value" lines into two-column section fields
    for (const line of sources.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(": ");
      if (colonIdx > 0) {
        const name = trimmed.slice(0, colonIdx);
        const value = trimmed.slice(colonIdx + 2);
        blocks.push({
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*${name}*` },
            { type: "mrkdwn", text: `\`\`\`${value}\`\`\`` },
          ],
        });
      } else {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `\`\`\`${trimmed}\`\`\`` },
        });
      }
    }
  } else if (sources) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: ":clipboard: Show sources", emoji: true },
          action_id: "show_sources",
        },
      ],
    });
  }

  // Stats context block
  if (stats) {
    const parts: string[] = [];
    if (stats.durationMs != null) {
      const secs = (stats.durationMs / 1000).toFixed(1);
      parts.push(`:stopwatch: ${secs}s`);
    }
    if (stats.totalTokens != null) {
      const detail: string[] = [];
      if (stats.promptTokens != null) detail.push(`${stats.promptTokens} in`);
      if (stats.completionTokens != null)
        detail.push(`${stats.completionTokens} out`);
      const summary = detail.length
        ? `${stats.totalTokens} tokens (${detail.join(", ")})`
        : `${stats.totalTokens} tokens`;
      parts.push(`:bar_chart: ${summary}`);
    }
    if (parts.length > 0) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: parts.join("     ") }],
      });
    }
  }

  // Feedback buttons (context_actions)
  blocks.push({
    type: "context_actions",
    elements: [
      {
        type: "feedback_buttons",
        action_id: "response_feedback",
        positive_button: {
          text: { type: "plain_text", text: "\ud83d\udc4d" },
          value: "positive",
          accessibility_label: "Mark this response as helpful",
        },
        negative_button: {
          text: { type: "plain_text", text: "\ud83d\udc4e" },
          value: "negative",
          accessibility_label: "Mark this response as not helpful",
        },
      },
    ],
  });

  const fallback = markdownToMrkdwn(text);
  return { text: fallback, blocks };
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
