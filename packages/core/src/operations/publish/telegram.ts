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

/**
 * Sends a single TelegramMessageChunk via Telegram Bot API sendMessage.
 */
export async function sendTelegramChunk(
  botToken: string,
  chunk: TelegramMessageChunk
): Promise<{ ok: boolean; messageId?: number }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chunk.chatId,
      text: chunk.text,
      parse_mode: chunk.parseMode || "HTML",
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };

  if (!data.ok) {
    throw new Error(`Telegram API Error: ${data.description || "Failed to dispatch message"}`);
  }

  return { ok: true, messageId: data.result?.message_id };
}

/**
 * Dispatches all chunks with rate-limit pacing (defaults to 1000ms delay between consecutive chunks).
 */
export async function sendTelegramChunks(
  botToken: string,
  chunks: TelegramMessageChunk[],
  delayMs = 1000
): Promise<{ successfulChunks: number; totalChunks: number }> {
  let successCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    await sendTelegramChunk(botToken, chunk);
    successCount++;
    if (i < chunks.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { successfulChunks: successCount, totalChunks: chunks.length };
}

