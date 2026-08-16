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

  // Full ReviewStatus reconciliation:
  // Main sequence: draft -> in_review -> approved -> scheduled -> sending -> sent
  // Exceptions: changes_requested (from in_review), failed (from sending)
  const mainSequence = ["draft", "in_review", "approved", "scheduled", "sending", "sent"];
  const currentIdx = mainSequence.indexOf(status);

  return (
    <Box flexDirection="column" gap={1}>
      {/* 1. Header: Title & Status */}
      <Box justifyContent="space-between" alignItems="flex-start">
        <Box flexGrow={1} marginRight={2}>
          <Text bold color={isNoColor ? undefined : colors.primary}>
            #{newsletter.issueNumber || "—"} {newsletter.title}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <TextStatusBadge status={status} />
        </Box>
      </Box>

      {/* 2. Metadata Line */}
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

      {/* 3. Reconciled State Stepper */}
      <Box flexDirection="column" marginY={0}>
        <Text bold>Review Workflow Stepper:</Text>
        <Box gap={1} flexWrap="wrap">
          {mainSequence.map((st, i) => {
            const isCurrent = status === st;
            const isCompleted = currentIdx >= 0 && i < currentIdx;

            const symbol = isCurrent ? "[●" : isCompleted ? "[✓" : "[○";
            const textColor = isCurrent
              ? colors.primary
              : isCompleted
                ? colors.success
                : colors.dim;

            return (
              <Box key={st} gap={1}>
                <Text
                  color={isNoColor ? undefined : textColor}
                  bold={isCurrent}
                  underline={isCurrent}
                >
                  {symbol} {st.toUpperCase()}]
                </Text>
                {i < mainSequence.length - 1 && <Text dimColor>──▶</Text>}
              </Box>
            );
          })}
        </Box>

        {/* Branch states display */}
        {status === "changes_requested" && (
          <Box marginTop={0}>
            <Text color={isNoColor ? undefined : colors.warning} bold>
              └──▶ [⚠ CHANGES_REQUESTED] (Action: revise and submit_for_review)
            </Text>
          </Box>
        )}
        {status === "failed" && (
          <Box marginTop={0}>
            <Text color={isNoColor ? undefined : colors.danger} bold>
              └──▶ [✖ FAILED] (Action: retry or reschedule)
            </Text>
          </Box>
        )}
      </Box>

      {/* 4. Sections Breakdown */}
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

      {/* 5. Available Actions Bar */}
      <Box marginTop={1} borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text bold color={isNoColor ? undefined : colors.primary}>Actions:</Text>
          <Text dimColor>[t] Transition ({nextActions.join(" | ") || "None"})</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>[p] Preview HTML</Text>
        </Box>
      </Box>
    </Box>
  );
};
