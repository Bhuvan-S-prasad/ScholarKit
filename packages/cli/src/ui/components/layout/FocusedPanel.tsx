import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface FocusedPanelProps {
  title: string;
  width?: string | number;
  flexGrow?: number;
  flexShrink?: number;
  isFocused?: boolean;
  rightHeader?: string;
  children: React.ReactNode;
}

export const FocusedPanel: React.FC<FocusedPanelProps> = ({
  title,
  width,
  flexGrow,
  flexShrink,
  isFocused = false,
  rightHeader,
  children,
}) => {
  const { colors, isNoColor } = useTheme();

  return (
    <Box
      width={width}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
      flexDirection="column"
      borderStyle="single"
      borderColor={
        isNoColor
          ? undefined
          : isFocused
            ? colors.borderFocused
            : colors.borderUnfocused
      }
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={!isNoColor && isFocused ? colors.primary : undefined}>
          {title}
        </Text>
        {rightHeader ? (
          <Text dimColor>{rightHeader}</Text>
        ) : isFocused ? (
          <Text color={isNoColor ? undefined : colors.primary}>[Focused]</Text>
        ) : null}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
};
