import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface HeaderProps {
  activeTabTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ activeTabTitle }) => {
  const { colors, isNoColor } = useTheme();
  const modelName = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

  return (
    <Box
      justifyContent="space-between"
      borderStyle="single"
      borderColor={isNoColor ? undefined : colors.primary}
      paddingX={1}
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
        <Text color={isNoColor ? undefined : colors.primary}>{modelName}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>DB:</Text>
        <Text color={isNoColor ? undefined : colors.success}>Neon Connected</Text>
      </Box>
    </Box>
  );
};
