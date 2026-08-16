import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface StatusSpinnerProps {
  label: string;
}

export const StatusSpinner: React.FC<StatusSpinnerProps> = ({ label }) => {
  const { colors, isNoColor } = useTheme();

  return (
    <Box gap={1}>
      <Text color={isNoColor ? undefined : colors.primary}>
        <Spinner type="dots" />
      </Text>
      <Text bold>{label}</Text>
    </Box>
  );
};
