import React from "react";
import { Box, Text } from "ink";
import { getAvailableWorkflowActions } from "@scholarkit/core";
import { BriefingWithSections } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface BriefingDetailViewProps {
  briefing: BriefingWithSections | null;
}

export const BriefingDetailView: React.FC<BriefingDetailViewProps> = ({ briefing }) => {
  const { colors, isNoColor } = useTheme();

  if (!briefing) {
    return (
      <Box paddingY={1}>
        <Text dimColor>Select a research briefing issue from the left pane to view details.</Text>
      </Box>
    );
  }

  const status = briefing.status;
  const nextActions = getAvailableWorkflowActions(status as any);

  // Main sequence: draft -> in_review -> approved -> scheduled -> sending -> sent
  const mainSequence = ["draft", "in_review", "approved", "scheduled", "sending", "sent"];
  const currentIdx = mainSequence.indexOf(status);

  let contextualHint = "";
  if (status === "draft") {
    contextualHint = "Hint: Press [t] to advance status to 'in_review'.";
  } else if (status === "in_review") {
    contextualHint = "Editorial: Press [a] to approve this issue or [c] to request changes.";
  } else if (status === "approved") {
    contextualHint = "Publishing: Press [S] to schedule send, or [p] to preview Telegram HTML.";
  } else if (status === "scheduled") {
    const timeStr = briefing.scheduledAt ? new Date(briefing.scheduledAt).toLocaleString() : "Pending";
    contextualHint = `Queued: Scheduled for ${timeStr}. Press [w] to dispatch worker now.`;
  } else if (status === "changes_requested") {
    contextualHint = "Editorial: Revisions requested. Revise content and press [t] to re-submit.";
  } else if (status === "failed") {
    contextualHint = "Delivery failed: Check Telegram token and press [t] to retry.";
  }

  return (
    <Box flexDirection="column" gap={1}>
      {/* 1. Header: Title & Status */}
      <Box justifyContent="space-between" alignItems="flex-start">
        <Box flexGrow={1} marginRight={2}>
          <Text bold color={isNoColor ? undefined : colors.primary}>
            #{briefing.issueNumber || "—"} {briefing.title}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <TextStatusBadge status={status} />
        </Box>
      </Box>

      {/* 2. Metadata Line */}
      <Box gap={1}>
        <Text dimColor>Target: {briefing.target}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>Updated: {briefing.updatedAt.toISOString().split("T")[0]}</Text>
        {briefing.scheduledAt && status === "scheduled" && (
          <>
            <Text dimColor>│</Text>
            <Text color={isNoColor ? undefined : colors.primary}>
              Scheduled: {new Date(briefing.scheduledAt).toLocaleTimeString()}
            </Text>
          </>
        )}
        {briefing.sentAt && (
          <>
            <Text dimColor>│</Text>
            <Text color={isNoColor ? undefined : colors.success}>
              Sent: {briefing.sentAt.toISOString().split("T")[0]}
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

      {/* Contextual Action Guidance Banner */}
      {contextualHint && (
        <Box borderStyle="single" borderColor={isNoColor ? undefined : colors.borderFocused} paddingX={1}>
          <Text color={isNoColor ? undefined : colors.primary}>{contextualHint}</Text>
        </Box>
      )}

      {/* 4. Sections Breakdown */}
      <Box flexDirection="column">
        <Text bold>Sections ({briefing.sections.length}):</Text>
        {briefing.sections.map((sec) => (
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
      <Box marginTop={1} borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1} justifyContent="space-between" flexWrap="wrap">
        <Box gap={1}>
          <Text bold color={isNoColor ? undefined : colors.primary}>Actions:</Text>
          <Text dimColor>[t] Transition ({nextActions.join(" | ") || "None"})</Text>
          {status === "in_review" && <Text bold color={isNoColor ? undefined : colors.success}>│ [a] Approve</Text>}
          {status === "in_review" && <Text bold color={isNoColor ? undefined : colors.warning}>│ [c] Changes</Text>}
          {status === "approved" && <Text bold color={isNoColor ? undefined : colors.primary}>│ [S] Schedule</Text>}
          {status === "scheduled" && <Text bold color={isNoColor ? undefined : colors.success}>│ [w] Dispatch</Text>}
        </Box>
        <Box gap={1}>
          <Text dimColor>[p] Preview HTML</Text>
        </Box>
      </Box>
    </Box>
  );
};

// Backwards-compatible alias
export const NewsletterDetailView = BriefingDetailView;
