import React from "react";
import { Box, Text } from "ink";
import { SCHOLARKIT_CONFIG } from "@scholarkit/core";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface HeaderProps {
  activeTabTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ activeTabTitle }) => {
  const { colors, isNoColor } = useTheme();
  const rawModel = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;
  const shortModel = rawModel.includes("/") ? rawModel.split("/")[1] || rawModel : rawModel;

  return (
    <Box
      justifyContent="space-between"
      borderStyle="single"
      borderColor={isNoColor ? undefined : colors.primary}
      paddingX={1}
      flexWrap="wrap"
    >
      <Box gap={1}>
        <Text bold color={isNoColor ? undefined : colors.primary}>
          ScholarKit
        </Text>
        <Text dimColor>│</Text>
        <Text bold>{activeTabTitle}</Text>
      </Box>
      <Box gap={1}>
        <Text dimColor>Model:</Text>
        <Text color={isNoColor ? undefined : colors.primary}>{shortModel}</Text>
        <Text dimColor>│</Text>
        <Text color={isNoColor ? undefined : colors.success}>DB: Neon</Text>
      </Box>
    </Box>
  );
};
