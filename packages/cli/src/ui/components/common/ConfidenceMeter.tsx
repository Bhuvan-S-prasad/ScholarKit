import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface ConfidenceMeterProps {
  score: number; // 0.0 - 1.0
  totalBlocks?: number;
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({
  score,
  totalBlocks = 10,
}) => {
  const { colors, isNoColor } = useTheme();

  const filledCount = Math.round(Math.max(0, Math.min(1, score)) * totalBlocks);
  const emptyCount = totalBlocks - filledCount;
  const filledBar = "█".repeat(filledCount);
  const emptyBar = "░".repeat(emptyCount);
  const percent = (score * 100).toFixed(0);

  let label = "Low Confidence (Review Required)";
  let statusColor = colors.danger;

  if (score >= 0.8) {
    label = "High Confidence";
    statusColor = colors.success;
  } else if (score >= 0.6) {
    label = "Moderate Confidence";
    statusColor = colors.warning;
  }

  return (
    <Box gap={1}>
      <Text color={isNoColor ? undefined : statusColor}>
        [{filledBar}
        {emptyBar}]
      </Text>
      <Text bold>{percent}%</Text>
      <Text color={isNoColor ? undefined : statusColor}>({label})</Text>
    </Box>
  );
};
