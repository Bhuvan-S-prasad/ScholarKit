import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface FooterProps {
  customHotkeys?: Array<{ key: string; label: string }>;
}

export const Footer: React.FC<FooterProps> = ({ customHotkeys = [] }) => {
  const { colors, isNoColor } = useTheme();

  const allItems = [
    { key: "1/2/3", label: "Tabs" },
    { key: "Tab", label: "Focus" },
    { key: "↑/↓", label: "Nav" },
    ...customHotkeys,
    { key: "q", label: "Quit" },
  ];

  return (
    <Box
      marginTop={1}
      borderStyle="single"
      borderColor={isNoColor ? undefined : colors.borderUnfocused}
      paddingX={1}
      flexWrap="wrap"
      gap={1}
    >
      {allItems.map((item, idx) => (
        <Box key={item.key}>
          <Text color={isNoColor ? undefined : colors.primary} bold>
            [{item.key}]
          </Text>
          <Text dimColor> {item.label}</Text>
          {idx < allItems.length - 1 && <Text dimColor> │ </Text>}
        </Box>
      ))}
    </Box>
  );
};
