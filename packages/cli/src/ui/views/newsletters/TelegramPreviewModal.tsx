import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  formatNewsletterForTelegramHtml,
  chunkTelegramMessage,
  sendTelegramChunks,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { NewsletterWithSections } from "../../contexts/AppStateContext.js";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface TelegramPreviewModalProps {
  newsletter: NewsletterWithSections | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const TelegramPreviewModal: React.FC<TelegramPreviewModalProps> = ({
  newsletter,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { colors, isNoColor } = useTheme();
  const [sending, setSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput(
    async (input, key) => {
      if (!isOpen || !newsletter) return;
      if (key.escape && !sending) {
        onClose();
      } else if ((input === "s" || input === "S") && !sending && !sendResult) {
        // Dispatch to Telegram
        setSending(true);
        setError(null);
        try {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = process.env.TELEGRAM_CHAT_ID;

          if (!botToken || botToken.includes("123456789")) {
            throw new Error("TELEGRAM_BOT_TOKEN missing in .env.");
          }
          if (!chatId) {
            throw new Error("TELEGRAM_CHAT_ID missing in .env.");
          }

          const html = formatNewsletterForTelegramHtml({
            title: newsletter.title,
            issueNumber: newsletter.issueNumber || undefined,
            contentType: newsletter.contentType,
            status: newsletter.status,
            target: newsletter.target,
            sections: newsletter.sections.map((s) => ({
              title: s.title,
              content: s.content,
              order: s.order,
              sectionType: s.sectionType as any,
              paperReferences: s.paperReferences,
            })),
          });

          const chunks = chunkTelegramMessage(html, chatId, 4096);
          const res = await sendTelegramChunks(botToken, chunks, 1000);

          await prisma.newsletter.update({
            where: { id: newsletter.id },
            data: { status: "sent", sentAt: new Date() },
          });

          await prisma.deliveryLog.create({
            data: {
              newsletterId: newsletter.id,
              telegramChatId: chatId,
              status: "sent",
              sentAt: new Date(),
            },
          });

          setSendResult(`Delivered ${res.successfulChunks}/${res.totalChunks} chunks to ${chatId}!`);
          await onSuccess();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setSending(false);
        }
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen || !newsletter) return null;

  const html = formatNewsletterForTelegramHtml({
    title: newsletter.title,
    issueNumber: newsletter.issueNumber || undefined,
    contentType: newsletter.contentType,
    status: newsletter.status,
    target: newsletter.target,
    sections: newsletter.sections.map((s) => ({
      title: s.title,
      content: s.content,
      order: s.order,
      sectionType: s.sectionType as any,
      paperReferences: s.paperReferences,
    })),
  });

  const chunks = chunkTelegramMessage(html, "preview", 4096);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={isNoColor ? undefined : colors.primary}
      paddingX={1}
      paddingY={1}
      marginTop={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isNoColor ? undefined : colors.primary}>
          Telegram Digest HTML Preview: #{newsletter.issueNumber || "—"} {newsletter.title}
        </Text>
        <Text dimColor>[Esc to close │ s to send to Telegram]</Text>
      </Box>

      {sending ? (
        <Box paddingY={1}>
          <StatusSpinner label="Dispatching chunks to Telegram Bot API with 1s pacing..." />
        </Box>
      ) : sendResult ? (
        <Box flexDirection="column" gap={1}>
          <Text color={isNoColor ? undefined : colors.success} bold>
            {sendResult}
          </Text>
          <Text dimColor>Press Esc to return to dashboard.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text bold>Total Length:</Text>
            <Text>{html.length} chars</Text>
            <Text dimColor>│</Text>
            <Text bold>Chunks:</Text>
            <Text color={isNoColor ? undefined : colors.primary}>
              {chunks.length} message(s) (4096 limit)
            </Text>
          </Box>

          <Box flexDirection="column" borderStyle="single" borderColor={isNoColor ? undefined : colors.borderUnfocused} paddingX={1}>
            <Text bold color={isNoColor ? undefined : colors.primary}>
              Chunk [1/{chunks.length}] Preview:
            </Text>
            <Text dimColor>{chunks[0]?.text.slice(0, 240)}...</Text>
          </Box>

          {error && <Text color="red">Error: {error}</Text>}

          <Box justifyContent="space-between">
            <Text dimColor>Press [s] to dispatch live to Telegram Bot API, or [Esc] to return.</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
