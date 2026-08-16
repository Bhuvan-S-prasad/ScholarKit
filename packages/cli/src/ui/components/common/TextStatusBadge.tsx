import React from "react";
import { Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface TextStatusBadgeProps {
  status: string;
}

export const TextStatusBadge: React.FC<TextStatusBadgeProps> = ({ status }) => {
  const { colors, isNoColor } = useTheme();

  const upper = status.toUpperCase();
  let statusColor = colors.dim;

  if (upper === "EXTRACTED" || upper === "APPROVED" || upper === "SENT" || upper === "HIGHLY_RELEVANT") {
    statusColor = colors.success;
  } else if (upper === "IN_REVIEW" || upper === "SCHEDULED" || upper === "RELEVANT" || upper === "INGESTED") {
    statusColor = colors.warning;
  } else if (upper === "FAILED" || upper === "CHANGES_REQUESTED" || upper === "IRRELEVANT") {
    statusColor = colors.danger;
  } else if (upper === "ANALYZED") {
    statusColor = colors.primary;
  }

  return (
    <Text color={isNoColor ? undefined : statusColor} bold>
      [{upper}]
    </Text>
  );
};
