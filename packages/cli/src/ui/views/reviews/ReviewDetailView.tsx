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
        <Text dimColor>Evaluating inclusion criteria against ingested paper abstracts...</Text>
      </Box>
    );
  }

  const entries = project.entries;
  const highlyRelevant = entries.filter((e) => e.classification === "highly_relevant");
  const relevant = entries.filter((e) => e.classification === "relevant");
  const otherEntries = entries.filter((e) => e.classification !== "highly_relevant" && e.classification !== "relevant");

  return (
    <Box flexDirection="column" gap={1}>
      {/* Title & Status */}
      <Box justifyContent="space-between">
        <Text bold color={isNoColor ? undefined : colors.primary}>
          {project.title}
        </Text>
        <TextStatusBadge status={project.status} />
      </Box>

      {/* Query & Criteria */}
      <Box flexDirection="column">
        <Text bold>Research Query:</Text>
        <Text color={isNoColor ? undefined : colors.primary}>"{project.query}"</Text>
        {project.inclusionCriteria.length > 0 && (
          <Text dimColor>Inclusion: {project.inclusionCriteria.join("; ")}</Text>
        )}
      </Box>

      {/* Ranked Entries Breakdown */}
      {entries.length === 0 ? (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text dimColor>No papers have been ranked against this project's criteria yet.</Text>
          <Box borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1}>
            <Text bold color={isNoColor ? undefined : colors.primary}>Action: </Text>
            <Text dimColor>Press </Text>
            <Text bold>[r]</Text>
            <Text dimColor> to rank all ingested papers against project query.</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box justifyContent="space-between">
            <Text bold>Ranked Papers ({entries.length}):</Text>
            <Text dimColor>[r] Re-rank │ [d] Draft Synthesis</Text>
          </Box>

          {/* Highly Relevant Section */}
          {highlyRelevant.length > 0 && (
            <Box flexDirection="column">
              <Text bold color={isNoColor ? undefined : colors.success}>
                === Highly Relevant ({highlyRelevant.length}) ===
              </Text>
              {highlyRelevant.slice(0, 3).map((item) => (
                <Box key={item.id} flexDirection="column">
                  <Text bold>• {item.paper.title.slice(0, 40)}... ({(item.relevanceScore * 100).toFixed(0)}%)</Text>
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
                  <Text>• {item.paper.title.slice(0, 40)}... ({(item.relevanceScore * 100).toFixed(0)}%)</Text>
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
    </Box>
  );
};
