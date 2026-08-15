import { TelegramMessageChunk, TelegramMessageChunkSchema, Newsletter } from "../../schemas.js";

/**
 * Splits text into chunks strictly under the Telegram 4096-character limit.
 * Chunks on double-newlines (paragraphs), single newlines, or spaces to avoid slicing words.
 */
export function chunkTelegramMessage(
  text: string,
  chatId = "preview",
  limit = 4096
): TelegramMessageChunk[] {
  if (text.length <= limit) {
    return [
      TelegramMessageChunkSchema.parse({
        chatId,
        text,
        parseMode: "HTML",
        chunkIndex: 0,
        totalChunks: 1,
      }),
    ];
  }

  const rawChunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      rawChunks.push(remaining);
      break;
    }

    // Attempt to split at paragraph boundary
    let splitIdx = remaining.lastIndexOf("\n\n", limit);
    if (splitIdx === -1 || splitIdx < limit * 0.5) {
      // Attempt to split at line break
      splitIdx = remaining.lastIndexOf("\n", limit);
    }
    if (splitIdx === -1 || splitIdx < limit * 0.5) {
      // Attempt to split at whitespace
      splitIdx = remaining.lastIndexOf(" ", limit);
    }
    if (splitIdx === -1) {
      // Hard cutoff fallback if single word/token exceeds limit
      splitIdx = limit;
    }

    const chunk = remaining.slice(0, splitIdx).trim();
    if (chunk.length > 0) {
      rawChunks.push(chunk);
    }
    remaining = remaining.slice(splitIdx).trim();
  }

  return rawChunks.map((chunkText, idx) =>
    TelegramMessageChunkSchema.parse({
      chatId,
      text: chunkText,
      parseMode: "HTML",
      chunkIndex: idx,
      totalChunks: rawChunks.length,
    })
  );
}

/**
 * Formats a full Newsletter object into Telegram-compatible text (HTML format).
 */
export function formatNewsletterForTelegramHtml(newsletter: Newsletter): string {
  const parts: string[] = [];

  parts.push(`<b>📰 ${newsletter.title}</b>`);
  if (newsletter.issueNumber) {
    parts.push(`<i>Issue #${newsletter.issueNumber}</i>`);
  }
  parts.push("");

  for (const section of newsletter.sections) {
    parts.push(`<b>▶ ${section.title}</b>`);
    parts.push(section.content);
    if (section.paperReferences && section.paperReferences.length > 0) {
      parts.push(`<i>References: ${section.paperReferences.join(", ")}</i>`);
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}
