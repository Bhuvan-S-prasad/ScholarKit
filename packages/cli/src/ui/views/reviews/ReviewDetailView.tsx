import React from "react";
import { Box, Text } from "ink";
import { ProjectWithEntries } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface ReviewDetailViewProps {
  project: ProjectWithEntries | null;
  ranking: boolean;
  rankingProgressText?: string;
}

export const ReviewDetailView: React.FC<ReviewDetailViewProps> = ({
  project,
  ranking,
  rankingProgressText = "Classifying & ranking papers via OpenRouter...",
}) => {
  const { colors, isNoColor } = useTheme();

  if (!project) {
    return (
      <Box paddingY={1}>
        <Text dimColor>Select a review project from the left pane to view details.</Text>
      </Box>
    );
  }

  if (ranking) {
    return (
      <Box flexDirection="column" gap={1} paddingY={2}>
        <StatusSpinner label={rankingProgressText} />
        <Text dimColor>Executing multi-criteria evaluation against arXiv abstracts...</Text>
      </Box>
    );
  }

  const entries = project.entries;
  const highlyRelevant = entries.filter((e) => e.classification === "highly_relevant");
  const relevant = entries.filter((e) => e.classification === "relevant");
  const otherEntries = entries.filter((e) => e.classification !== "highly_relevant" && e.classification !== "relevant");

  return (
    <Box flexDirection="column" gap={1}>
      {/* 1. Title & Status */}
      <Box justifyContent="space-between" alignItems="flex-start">
        <Box flexGrow={1} marginRight={2}>
          <Text bold color={isNoColor ? undefined : colors.primary}>
            {project.title}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <TextStatusBadge status={project.status} />
        </Box>
      </Box>

      {/* 2. Research Query & Inclusion Criteria */}
      <Box flexDirection="column">
        <Text bold>Research Query:</Text>
        <Text color={isNoColor ? undefined : colors.primary}>"{project.query}"</Text>
        {project.inclusionCriteria.length > 0 && (
          <Text dimColor>Inclusion: {project.inclusionCriteria.join("; ")}</Text>
        )}
      </Box>

      {/* 3. Ranked Entries Matrix */}
      {entries.length === 0 ? (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text dimColor>No papers have been ranked against this project's criteria yet.</Text>
          <Box borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1}>
            <Text bold color={isNoColor ? undefined : colors.primary}>Quick Start: </Text>
            <Text dimColor>Press </Text>
            <Text bold>[s]</Text>
            <Text dimColor> to Search arXiv for Query, or </Text>
            <Text bold>[r]</Text>
            <Text dimColor> to rank existing repository papers.</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box justifyContent="space-between">
            <Text bold>Ranked Papers ({entries.length}):</Text>
            <Text dimColor>Top matches scored 0.0–1.0</Text>
          </Box>

          {/* Highly Relevant Section */}
          {highlyRelevant.length > 0 && (
            <Box flexDirection="column">
              <Text bold color={isNoColor ? undefined : colors.success}>
                === Highly Relevant ({highlyRelevant.length}) ===
              </Text>
              {highlyRelevant.slice(0, 3).map((item) => (
                <Box key={item.id} flexDirection="column">
                  <Text bold>• {item.paper.title.slice(0, 42)}... ({(item.relevanceScore * 100).toFixed(0)}%)</Text>
                  <Text dimColor>  {item.reasonForScore.slice(0, 70)}...</Text>
                </Box>
              ))}
            </Box>
          )}

          {/* Relevant Section */}
          {relevant.length > 0 && (
            <Box flexDirection="column">
              <Text bold color={isNoColor ? undefined : colors.primary}>
                === Relevant ({relevant.length}) ===
              </Text>
              {relevant.slice(0, 2).map((item) => (
                <Box key={item.id} flexDirection="column">
                  <Text>• {item.paper.title.slice(0, 42)}... ({(item.relevanceScore * 100).toFixed(0)}%)</Text>
                </Box>
              ))}
            </Box>
          )}

          {/* Other Categories Count */}
          {otherEntries.length > 0 && (
            <Text dimColor>+ {otherEntries.length} background / excluded papers</Text>
          )}
        </Box>
      )}

      {/* 4. Available Actions Dock */}
      <Box marginTop={1} borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1} justifyContent="space-between" flexWrap="wrap">
        <Box gap={1}>
          <Text bold color={isNoColor ? undefined : colors.primary}>Actions:</Text>
          <Text dimColor>[s] Search arXiv │ [r] Rank │ [d] Draft Synthesis</Text>
        </Box>
        <Box gap={1}>
          <Text bold color={isNoColor ? undefined : colors.success}>[N] Bridge to Newsletter</Text>
        </Box>
      </Box>
    </Box>
  );
};
