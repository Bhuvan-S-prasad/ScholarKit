import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { createBriefingFromRecentPapers, PaperMetadata } from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface CreateBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const CreateBriefingModal: React.FC<CreateBriefingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { colors, isNoColor } = useTheme();
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (!isOpen) return;
    if (key.escape && !loading) {
      onClose();
    }
  });

  if (!isOpen) return null;

  const handleSubmit = async (titleVal: string) => {
    if (!titleVal.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const recentPapers = await prisma.paper.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
      });

      if (recentPapers.length === 0) {
        throw new Error("No papers found in database. Ingest papers first via Tab 1 [i].");
      }

      const count = await prisma.briefing.count();
      const issueNumber = count + 1;

      const domainPapers: PaperMetadata[] = recentPapers.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        abstract: p.abstract,
        publishedDate: p.publishedDate,
        source: p.source as any,
        sourceId: p.sourceId,
        url: p.url,
        pdfUrl: p.pdfUrl || undefined,
        categories: p.categories,
        status: p.status as any,
        rawContent: p.rawContent || undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));

      // Use core pure operation
      const briefingDraft = createBriefingFromRecentPapers(domainPapers, {
        title: titleVal.trim(),
        issueNumber,
        target: "telegram_channel",
      });

      await prisma.briefing.create({
        data: {
          title: briefingDraft.title,
          issueNumber: briefingDraft.issueNumber,
          contentType: briefingDraft.contentType,
          status: briefingDraft.status,
          target: briefingDraft.target,
          sections: {
            create: briefingDraft.sections.map((s) => ({
              title: s.title,
              content: s.content,
              order: s.order,
              sectionType: s.sectionType,
              paperReferences: s.paperReferences,
            })),
          },
        },
      });

      await onSuccess();
      setTimeout(() => {
        setLoading(false);
        setTitle("");
        onClose();
      }, 400);
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
          Draft New Research Briefing (Recent Papers Roundup)
        </Text>
        <Text dimColor>[Esc to cancel]</Text>
      </Box>

      {loading ? (
        <Box paddingY={1}>
          <StatusSpinner label="Generating structured briefing sections via core engine..." />
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text bold>Briefing Title: </Text>
            <TextInput
              value={title}
              onChange={setTitle}
              onSubmit={handleSubmit}
              placeholder="e.g. ScholarKit Research Briefing: Issue 2"
            />
          </Box>
          {error && <Text color="red">Error: {error}</Text>}
          <Text dimColor>Type title and press Enter to auto-generate roundup sections from recent papers.</Text>
        </Box>
      )}
    </Box>
  );
};

// Backwards-compatible alias
export const CreateNewsletterModal = CreateBriefingModal;
