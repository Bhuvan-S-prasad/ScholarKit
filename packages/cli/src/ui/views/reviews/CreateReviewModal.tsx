import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  searchArxivPapers,
  classifyAndRankPapers,
  createOpenRouterClient,
  createMockLLMClient,
  LitReviewProject,
  PaperMetadata,
  SCHOLARKIT_CONFIG,
} from "@scholarkit/core";
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
  const [step, setStep] = useState<"title" | "query" | "prompt_search" | "executing">("title");
  const [title, setTitle] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [progressStage, setProgressStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (!isOpen) return;

    if (step === "prompt_search") {
      if (input === "y" || input === "Y" || key.return) {
        handleExecuteSearch(true);
      } else if (input === "n" || input === "N" || key.escape) {
        handleExecuteSearch(false);
      }
      return;
    }

    if (key.escape && step !== "executing") {
      onClose();
    }
  });

  if (!isOpen) return null;

  const handleTitleSubmit = (val: string) => {
    if (!val.trim()) return;
    setStep("query");
  };

  const handleQuerySubmit = (queryVal: string) => {
    if (!queryVal.trim()) return;
    setStep("prompt_search");
  };

  const handleExecuteSearch = async (shouldSearchArxiv: boolean) => {
    setStep("executing");
    setError(null);

    try {
      // 1. Create Literature Review Project in DB
      setProgressStage("Creating literature review project...");
      const project = await prisma.litReviewProject.create({
        data: {
          title: title.trim(),
          query: query.trim(),
          inclusionCriteria: ["Empirical evaluation", "Explicit methodology"],
          exclusionCriteria: [],
          status: "active",
        },
      });

      if (shouldSearchArxiv) {
        // 2. Search arXiv
        setProgressStage(`[1/3] Searching arXiv for "${query.trim()}"...`);
        const searchResults = await searchArxivPapers(query.trim(), { maxResults: 6 });

        if (searchResults.length > 0) {
          // 3. Deduplicate and Ingest
          setProgressStage(`[2/3] Found ${searchResults.length} papers. Checking repository...`);
          const existing = await prisma.paper.findMany({
            where: { sourceId: { in: searchResults.map((p) => p.sourceId) } },
          });
          const existingIds = new Set(existing.map((p) => p.sourceId));
          const newPapers = searchResults.filter((p) => !existingIds.has(p.sourceId));

          for (const p of newPapers) {
            await prisma.paper.create({
              data: {
                title: p.title,
                authors: p.authors,
                abstract: p.abstract,
                publishedDate: p.publishedDate,
                source: p.source,
                sourceId: p.sourceId,
                url: p.url,
                pdfUrl: p.pdfUrl,
                categories: p.categories,
                status: p.status,
              },
            });
          }

          // 4. Rank papers
          setProgressStage(`[3/3] Ranking papers against project criteria via OpenRouter...`);
          const allRelevantPapers = await prisma.paper.findMany({
            where: { sourceId: { in: searchResults.map((p) => p.sourceId) } },
          });

          const domainPapers: PaperMetadata[] = allRelevantPapers.map((p) => ({
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

          const projectDomain: LitReviewProject = {
            id: project.id,
            title: project.title,
            description: project.description || undefined,
            query: project.query,
            inclusionCriteria: project.inclusionCriteria,
            exclusionCriteria: project.exclusionCriteria,
            status: "active",
          };

          const apiKey = process.env.OPENROUTER_API_KEY;
          const defaultModel = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;

          let evaluations;
          if (apiKey) {
            const llm = createOpenRouterClient({ apiKey, defaultModel });
            evaluations = await classifyAndRankPapers(projectDomain, domainPapers, llm);
          } else {
            const mockLlm = createMockLLMClient();
            evaluations = await classifyAndRankPapers(projectDomain, domainPapers, mockLlm);
          }

          for (const ev of evaluations) {
            const matched = allRelevantPapers.find(
              (p) => p.id === ev.paperId || p.sourceId === ev.paperId
            );
            if (!matched) continue;

            await prisma.litReviewEntry.upsert({
              where: {
                projectId_paperId: {
                  projectId: project.id,
                  paperId: matched.id,
                },
              },
              create: {
                projectId: project.id,
                paperId: matched.id,
                relevanceScore: ev.relevanceScore,
                classification: ev.classification,
                reasonForScore: ev.reasonForScore,
              },
              update: {
                relevanceScore: ev.relevanceScore,
                classification: ev.classification,
                reasonForScore: ev.reasonForScore,
              },
            });
          }
        }
      }

      await onSuccess();
      setTimeout(() => {
        setTitle("");
        setQuery("");
        setStep("title");
        onClose();
      }, 500);
    } catch (err) {
      setStep("query");
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

      {step === "executing" ? (
        <Box flexDirection="column" gap={1} paddingY={1}>
          <StatusSpinner label={progressStage} />
          <Text dimColor>Executing staged pipeline...</Text>
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
      ) : step === "query" ? (
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
          <Text dimColor>Type research scope and press Enter.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text bold color={isNoColor ? undefined : colors.primary}>
            Auto-Search arXiv?
          </Text>
          <Text>
            Would you like to search arXiv for top papers matching <Text bold>"{query}"</Text> and rank them automatically now?
          </Text>
          <Box gap={2} marginTop={1}>
            <Text bold color={isNoColor ? undefined : colors.success}>
              [Y / Enter] Yes, Search & Ingest
            </Text>
            <Text dimColor>[N] No, Create Empty Project</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
