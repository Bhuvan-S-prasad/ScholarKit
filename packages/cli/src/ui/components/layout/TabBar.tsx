import React from "react";
import { Box, Text } from "ink";
import { TabId } from "../../App.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface TabBarProps {
  activeTab: TabId;
}

export const TabBar: React.FC<TabBarProps> = ({ activeTab }) => {
  const { colors, isNoColor } = useTheme();

  return (
    <Box marginY={1} gap={2}>
      <Text
        color={!isNoColor && activeTab === "papers" ? colors.primary : undefined}
        bold={activeTab === "papers"}
      >
        {activeTab === "papers" ? "[1. Papers (Active)]" : " 1. Papers"}
      </Text>
      <Text dimColor>│</Text>
      <Text
        color={!isNoColor && activeTab === "reviews" ? colors.primary : undefined}
        bold={activeTab === "reviews"}
      >
        {activeTab === "reviews" ? "[2. Reviews (Active)]" : " 2. Reviews"}
      </Text>
      <Text dimColor>│</Text>
      <Text
        color={!isNoColor && activeTab === "newsletters" ? colors.primary : undefined}
        bold={activeTab === "newsletters"}
      >
        {activeTab === "newsletters" ? "[3. Newsletters (Active)]" : " 3. Newsletters"}
      </Text>
    </Box>
  );
};
