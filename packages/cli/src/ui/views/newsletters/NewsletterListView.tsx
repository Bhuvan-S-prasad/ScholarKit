import React from "react";
import { Box, Text, useInput } from "ink";
import { NewsletterWithSections } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface NewsletterListViewProps {
  newsletters: NewsletterWithSections[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isFocused: boolean;
  pageSize?: number;
}

export const NewsletterListView: React.FC<NewsletterListViewProps> = ({
  newsletters,
  selectedIndex,
  onSelect,
  isFocused,
  pageSize = 7,
}) => {
  const { colors, isNoColor } = useTheme();

  const totalPages = Math.max(1, Math.ceil(newsletters.length / pageSize));
  const currentPage = Math.min(
    totalPages - 1,
    Math.max(0, Math.floor(selectedIndex / pageSize))
  );
  const startIndex = currentPage * pageSize;
  const visibleNewsletters = newsletters.slice(startIndex, startIndex + pageSize);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        onSelect(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelect(Math.min(newsletters.length - 1, selectedIndex + 1));
      } else if (key.pageDown) {
        onSelect(Math.min(newsletters.length - 1, selectedIndex + pageSize));
      } else if (key.pageUp) {
        onSelect(Math.max(0, selectedIndex - pageSize));
      }
    },
    { isActive: isFocused }
  );

  if (newsletters.length === 0) {
    return (
      <Box paddingY={1}>
        <Text dimColor>No newsletters drafted. Press 'n' to draft a new issue.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" gap={0}>
        {visibleNewsletters.map((nl, idx) => {
          const actualIndex = startIndex + idx;
          const isSelected = actualIndex === selectedIndex;

          return (
            <Box key={nl.id} justifyContent="space-between" paddingX={1}>
              <Box gap={1} width="65%">
                <Text
                  bold={isSelected}
                  color={!isNoColor && isSelected ? colors.primary : undefined}
                >
                  {isSelected ? "▶" : " "} #{nl.issueNumber || "—"} {nl.title.slice(0, 16)}
                </Text>
                <Text dimColor>({nl.sections.length} sections)</Text>
              </Box>
              <TextStatusBadge status={nl.status} />
            </Box>
          );
        })}
      </Box>

      {/* Pagination Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          Showing {startIndex + 1}–{Math.min(startIndex + pageSize, newsletters.length)} of {newsletters.length}
        </Text>
        <Text dimColor>
          Page {currentPage + 1}/{totalPages}
        </Text>
      </Box>
    </Box>
  );
};
