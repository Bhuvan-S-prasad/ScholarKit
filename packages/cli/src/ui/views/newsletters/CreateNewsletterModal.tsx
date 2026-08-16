import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { prisma } from "@scholarkit/db";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface CreateNewsletterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const CreateNewsletterModal: React.FC<CreateNewsletterModalProps> = ({
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
        include: { extraction: true },
      });

      const count = await prisma.newsletter.count();
      const issueNumber = count + 1;

      type SectionType = "intro" | "deep_dive" | "quick_take" | "methodology_spotlight" | "outro" | "custom";
      const sectionsData: Array<{
        title: string;
        content: string;
        order: number;
        sectionType: SectionType;
        paperReferences: string[];
      }> = [
        {
          title: "Executive Overview",
          content: `Welcome to issue #${issueNumber} of ScholarKit Research Digest! In this issue, we highlight key findings across recent AI systems and machine learning papers.`,
          order: 1,
          sectionType: "intro",
          paperReferences: [],
        },
      ];

      let orderIdx = 2;
      for (const p of recentPapers) {
        const text = p.extraction?.keyFindings && p.extraction.keyFindings.length > 0
          ? p.extraction.keyFindings.map((f) => `• ${f}`).join("\n")
          : p.abstract;

        sectionsData.push({
          title: `Deep Dive: ${p.title}`,
          content: text,
          order: orderIdx++,
          sectionType: "deep_dive",
          paperReferences: [p.sourceId],
        });
      }

      sectionsData.push({
        title: "Looking Ahead",
        content: "Subscribe to stay updated with autonomous intelligence and systems engineering.",
        order: orderIdx,
        sectionType: "outro",
        paperReferences: [],
      });

      await prisma.newsletter.create({
        data: {
          title: titleVal.trim(),
          issueNumber,
          status: "draft",
          target: "telegram_channel",
          sections: {
            create: sectionsData.map((s) => ({
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
          Draft New Newsletter Issue
        </Text>
        <Text dimColor>[Esc to cancel]</Text>
      </Box>

      {loading ? (
        <Box paddingY={1}>
          <StatusSpinner label="Assembling sections from recent papers in Neon DB..." />
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text bold>Newsletter Title: </Text>
            <TextInput
              value={title}
              onChange={setTitle}
              onSubmit={handleSubmit}
              placeholder="e.g. ScholarKit Weekly: Issue 2"
            />
          </Box>
          {error && <Text color="red">Error: {error}</Text>}
          <Text dimColor>Type title and press Enter to auto-generate issue sections from recent papers.</Text>
        </Box>
      )}
    </Box>
  );
};
