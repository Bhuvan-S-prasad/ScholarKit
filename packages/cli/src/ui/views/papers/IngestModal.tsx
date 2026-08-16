import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  parseArxivAtomFeed,
  normalizeArxivId,
  buildArxivApiUrl,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { colors, isNoColor } = useTheme();
  const [identifier, setIdentifier] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (!isOpen) return;
    if (key.escape && !loading) {
      onClose();
    }
  });

  if (!isOpen) return null;

  const handleIngest = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setStatusMessage("Querying arXiv Atom feed XML...");

    try {
      const cleanId = normalizeArxivId(id);
      const apiUrl = buildArxivApiUrl(cleanId);
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`arXiv API returned HTTP ${res.status}: ${res.statusText}`);
      }

      setStatusMessage("Parsing Atom feed metadata...");
      const xmlText = await res.text();
      const papers = parseArxivAtomFeed(xmlText);

      if (papers.length === 0) {
        throw new Error(`No paper found matching arXiv ID "${cleanId}".`);
      }

      const parsed = papers[0]!;
      setStatusMessage(`Saving "${parsed.title.slice(0, 30)}..." to Neon DB...`);

      await prisma.paper.upsert({
        where: { sourceId: parsed.sourceId },
        create: {
          title: parsed.title,
          authors: parsed.authors,
          abstract: parsed.abstract,
          publishedDate: parsed.publishedDate,
          source: parsed.source,
          sourceId: parsed.sourceId,
          url: parsed.url,
          pdfUrl: parsed.pdfUrl,
          categories: parsed.categories,
          status: "ingested",
        },
        update: {
          title: parsed.title,
          authors: parsed.authors,
          abstract: parsed.abstract,
          publishedDate: parsed.publishedDate,
          url: parsed.url,
          pdfUrl: parsed.pdfUrl,
          categories: parsed.categories,
        },
      });

      setStatusMessage("Ingestion complete!");
      await onSuccess();
      setTimeout(() => {
        setLoading(false);
        setIdentifier("");
        onClose();
      }, 500);
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
    }
  };

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
          Ingest Research Paper from arXiv
        </Text>
        <Text dimColor>[Esc to cancel]</Text>
      </Box>

      {loading ? (
        <Box paddingY={1}>
          <StatusSpinner label={statusMessage} />
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text bold>arXiv ID or URL: </Text>
            <TextInput
              value={identifier}
              onChange={setIdentifier}
              onSubmit={handleIngest}
              placeholder="e.g. 2312.12456 or https://arxiv.org/abs/2312.12456"
            />
          </Box>
          {error && <Text color="red">Error: {error}</Text>}
          <Text dimColor>Press Enter to fetch and store in Neon DB, or Esc to cancel.</Text>
        </Box>
      )}
    </Box>
  );
};
