import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import {
  transitionReviewStatus,
  getAvailableWorkflowActions,
  WorkflowAction,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { BriefingWithSections } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { StatusSpinner } from "../../components/common/StatusSpinner.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface TransitionDialogProps {
  briefing: BriefingWithSections | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const TransitionDialog: React.FC<TransitionDialogProps> = ({
  briefing,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { colors, isNoColor } = useTheme();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (!isOpen) return;
    if (key.escape && !loading) {
      onClose();
    }
  });

  if (!isOpen || !briefing) return null;

  const currentStatus = briefing.status;
  const availableActions = getAvailableWorkflowActions(currentStatus as any);

  const items = availableActions.map((action) => ({
    label: `${action.replace(/_/g, " ").toUpperCase()}`,
    value: action,
  }));

  const handleSelect = async (item: { value: string }) => {
    setLoading(true);
    setError(null);

    try {
      const action = item.value as WorkflowAction;
      const nextStatus = transitionReviewStatus(currentStatus as any, action);

      await prisma.briefing.update({
        where: { id: briefing.id },
        data: {
          status: nextStatus,
          scheduledAt: nextStatus === "scheduled" ? new Date(Date.now() + 3600000) : briefing.scheduledAt,
          sentAt: nextStatus === "sent" ? new Date() : briefing.sentAt,
        },
      });

      await onSuccess();
      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 300);
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
          Advance Review State Machine: #{briefing.issueNumber || "—"} {briefing.title}
        </Text>
        <Text dimColor>[Esc to cancel]</Text>
      </Box>

      {loading ? (
        <Box paddingY={1}>
          <StatusSpinner label="Updating state in Neon DB..." />
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text bold>Current Status:</Text>
            <TextStatusBadge status={currentStatus} />
          </Box>

          {items.length === 0 ? (
            <Text dimColor>No valid transitions available from this state.</Text>
          ) : (
            <Box flexDirection="column">
              <Text bold>Select Workflow Action:</Text>
              <SelectInput items={items} onSelect={handleSelect} />
            </Box>
          )}

          {error && <Text color="red">Error: {error}</Text>}
        </Box>
      )}
    </Box>
  );
};
