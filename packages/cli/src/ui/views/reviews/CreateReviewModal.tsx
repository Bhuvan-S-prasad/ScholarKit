import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { prisma } from "@scholarkit/db";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface CreateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const CreateReviewModal: React.FC<CreateReviewModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { colors, isNoColor } = useTheme();
  const [step, setStep] = useState<"title" | "query">("title");
  const [title, setTitle] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (!isOpen) return;
    if (key.escape && !loading) {
      onClose();
    }
  });

  if (!isOpen) return null;

  const handleTitleSubmit = (val: string) => {
    if (!val.trim()) return;
    setStep("query");
  };

  const handleQuerySubmit = async (queryVal: string) => {
    if (!queryVal.trim()) return;
    setLoading(true);
    setError(null);

    try {
      await prisma.litReviewProject.create({
        data: {
          title: title.trim(),
          query: queryVal.trim(),
          inclusionCriteria: ["Peer-reviewed benchmarks", "Explicit methodology"],
          exclusionCriteria: [],
          status: "active",
        },
      });

      await onSuccess();
      setTimeout(() => {
        setLoading(false);
        setTitle("");
        setQuery("");
        setStep("title");
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
          Initialize Literature Review Project
        </Text>
        <Text dimColor>[Esc to cancel]</Text>
      </Box>

      {loading ? (
        <Box paddingY={1}>
          <StatusSpinner label="Creating literature review project in Neon DB..." />
        </Box>
      ) : step === "title" ? (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text bold>Project Title: </Text>
            <TextInput
              value={title}
              onChange={setTitle}
              onSubmit={handleTitleSubmit}
              placeholder="e.g. Agentic AI & Autonomous Coding Systems"
            />
          </Box>
          <Text dimColor>Type title and press Enter to proceed to Research Query.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>Title: "{title}"</Text>
          <Box gap={1}>
            <Text bold>Research Query: </Text>
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={handleQuerySubmit}
              placeholder="e.g. Autonomous LLM coding agents benchmarks"
            />
          </Box>
          {error && <Text color="red">Error: {error}</Text>}
          <Text dimColor>Type research scope and press Enter to create project.</Text>
        </Box>
      )}
    </Box>
  );
};
