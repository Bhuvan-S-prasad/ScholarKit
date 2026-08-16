import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface FooterProps {
  customHotkeys?: Array<{ key: string; label: string }>;
}

export const Footer: React.FC<FooterProps> = ({ customHotkeys = [] }) => {
  const { colors, isNoColor } = useTheme();

  return (
    <Box
      marginTop={1}
      borderStyle="single"
      borderColor={isNoColor ? undefined : colors.borderUnfocused}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={2}>
        <Text dimColor>[1/2/3] Tabs</Text>
        <Text dimColor>[Tab] Focus</Text>
        <Text dimColor>[↑/↓] Navigate</Text>
        {customHotkeys.map((hk) => (
          <Text key={hk.key} dimColor>
            [{hk.key}] {hk.label}
          </Text>
        ))}
      </Box>
      <Box gap={1}>
        <Text dimColor>[q] Quit</Text>
      </Box>
    </Box>
  );
};
