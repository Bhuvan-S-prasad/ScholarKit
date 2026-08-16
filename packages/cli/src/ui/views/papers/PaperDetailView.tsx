import React from "react";
import { Box, Text } from "ink";
import { PaperWithExtraction } from "../../contexts/AppStateContext.js";
import { ConfidenceMeter } from "../../components/common/ConfidenceMeter.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface PaperDetailViewProps {
  paper: PaperWithExtraction | null;
  extracting: boolean;
  extractionProgressText?: string;
  error?: string | null;
}

export const PaperDetailView: React.FC<PaperDetailViewProps> = ({
  paper,
  extracting,
  extractionProgressText = "Extracting methodology via OpenRouter...",
  error,
}) => {
  const { colors, isNoColor } = useTheme();

  if (!paper) {
    return (
      <Box paddingY={1}>
        <Text dimColor>Select a paper from the list on the left to inspect details.</Text>
      </Box>
    );
  }

  if (extracting) {
    return (
      <Box flexDirection="column" gap={1} paddingY={2}>
        <StatusSpinner label={extractionProgressText} />
        <Text dimColor>Streaming JSON structured validation...</Text>
      </Box>
    );
  }

  const extraction = paper.extraction;
  const methodology = extraction?.methodology as
    | { approach?: string; datasetInfo?: string; toolsOrFrameworks?: string[] }
    | undefined;

  return (
    <Box flexDirection="column" gap={1}>
      {error && (
        <Box borderStyle="single" borderColor="red" paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Title & Status */}
      <Box justifyContent="space-between">
        <Text bold color={isNoColor ? undefined : colors.primary}>
          {paper.title}
        </Text>
        <TextStatusBadge status={paper.status} />
      </Box>

      {/* Metadata Bar */}
      <Box gap={1} flexWrap="wrap">
        <Text dimColor>Authors: {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>Published: {paper.publishedDate}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>arXiv: {paper.sourceId}</Text>
      </Box>

      {/* Structured Extraction Section or Abstract */}
      {extraction ? (
        <Box flexDirection="column" gap={1}>
          {/* Confidence Meter */}
          <Box gap={1} alignItems="center">
            <Text bold>Confidence:</Text>
            <ConfidenceMeter score={extraction.confidence} />
          </Box>

          {/* Methodology */}
          <Box flexDirection="column">
            <Text bold color={isNoColor ? undefined : colors.primary}>
              Methodology Approach:
            </Text>
            <Text>{methodology?.approach || "Standard computational model"}</Text>
            {methodology?.datasetInfo && (
              <Text dimColor>Datasets: {methodology.datasetInfo}</Text>
            )}
          </Box>

          {/* Key Findings */}
          <Box flexDirection="column">
            <Text bold color={isNoColor ? undefined : colors.primary}>
              Key Findings:
            </Text>
            {extraction.keyFindings.slice(0, 3).map((f, i) => (
              <Text key={i}>• {f}</Text>
            ))}
          </Box>

          {/* Identified Limitations */}
          {extraction.limitations.length > 0 && (
            <Box flexDirection="column">
              <Text bold color={isNoColor ? undefined : colors.danger}>
                Limitations:
              </Text>
              {extraction.limitations.slice(0, 2).map((l, i) => (
                <Text key={i} dimColor>
                  - {l}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>Abstract:</Text>
            <Text>{paper.abstract.slice(0, 280)}...</Text>
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1}>
            <Text bold color={isNoColor ? undefined : colors.primary}>
              Actions:{" "}
            </Text>
            <Text dimColor>Press </Text>
            <Text bold>[e]</Text>
            <Text dimColor> to Extract with OpenRouter, or </Text>
            <Text bold>[s]</Text>
            <Text dimColor> for Offline Stub</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
