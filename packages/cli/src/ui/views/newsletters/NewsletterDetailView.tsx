import React from "react";
import { Box, Text } from "ink";
import { getAvailableWorkflowActions } from "@scholarkit/core";
import { NewsletterWithSections } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface NewsletterDetailViewProps {
  newsletter: NewsletterWithSections | null;
}

export const NewsletterDetailView: React.FC<NewsletterDetailViewProps> = ({ newsletter }) => {
  const { colors, isNoColor } = useTheme();

  if (!newsletter) {
    return (
      <Box paddingY={1}>
        <Text dimColor>Select a newsletter issue from the left pane to view details.</Text>
      </Box>
    );
  }

  const status = newsletter.status;
  const nextActions = getAvailableWorkflowActions(status as any);

  // Workflow state stepper nodes
  const steps = ["draft", "in_review", "approved", "scheduled", "sent"];
  const currentStepIdx = steps.indexOf(status);

  return (
    <Box flexDirection="column" gap={1}>
      {/* Title & Status */}
      <Box justifyContent="space-between">
        <Text bold color={isNoColor ? undefined : colors.primary}>
          #{newsletter.issueNumber || "—"} {newsletter.title}
        </Text>
        <TextStatusBadge status={status} />
      </Box>

      {/* Target & Timing Metadata */}
      <Box gap={1}>
        <Text dimColor>Target: {newsletter.target}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>Updated: {newsletter.updatedAt.toISOString().split("T")[0]}</Text>
        {newsletter.sentAt && (
          <>
            <Text dimColor>│</Text>
            <Text color={isNoColor ? undefined : colors.success}>
              Sent: {newsletter.sentAt.toISOString().split("T")[0]}
            </Text>
          </>
        )}
      </Box>

      {/* Text-based State Stepper */}
      <Box flexDirection="column" marginY={0}>
        <Text bold>Review Workflow Stepper:</Text>
        <Box gap={1} flexWrap="wrap">
          {steps.map((st, i) => {
            const isCompletedOrCurrent = currentStepIdx >= 0 && i <= currentStepIdx;
            const isCurrent = i === currentStepIdx;
            const nodeSymbol = isCurrent ? "[●" : isCompletedOrCurrent ? "[✓" : "[○";
            const nodeColor = isCurrent
              ? colors.primary
              : isCompletedOrCurrent
                ? colors.success
                : colors.dim;

            return (
              <Box key={st} gap={1}>
                <Text color={isNoColor ? undefined : nodeColor} bold={isCurrent}>
                  {nodeSymbol} {st.toUpperCase()}]
                </Text>
                {i < steps.length - 1 && <Text dimColor>──▶</Text>}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Sections Breakdown */}
      <Box flexDirection="column">
        <Text bold>Sections ({newsletter.sections.length}):</Text>
        {newsletter.sections.map((sec) => (
          <Box key={sec.id} flexDirection="column" marginY={0}>
            <Text bold>
              • [{sec.order}] {sec.title} ({sec.sectionType})
            </Text>
            <Text dimColor>
              {sec.content.slice(0, 80)}...
              {sec.paperReferences.length > 0 && ` [Ref: ${sec.paperReferences.join(", ")}]`}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Available Actions Bar */}
      <Box marginTop={1} borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text bold color={isNoColor ? undefined : colors.primary}>Actions:</Text>
          <Text dimColor>[t] Transition State ({nextActions.join(" | ") || "None"})</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>[p] Preview HTML</Text>
        </Box>
      </Box>
    </Box>
  );
};
