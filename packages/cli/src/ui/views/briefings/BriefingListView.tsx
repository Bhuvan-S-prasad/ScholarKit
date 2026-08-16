import React from "react";
import { Box, Text, useInput } from "ink";
import { BriefingWithSections } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface BriefingListViewProps {
  briefings: BriefingWithSections[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isFocused: boolean;
  pageSize?: number;
}

export const BriefingListView: React.FC<BriefingListViewProps> = ({
  briefings,
  selectedIndex,
  onSelect,
  isFocused,
  pageSize = 7,
}) => {
  const { colors, isNoColor } = useTheme();

  const totalPages = Math.max(1, Math.ceil(briefings.length / pageSize));
  const currentPage = Math.min(
    totalPages - 1,
    Math.max(0, Math.floor(selectedIndex / pageSize))
  );
  const startIndex = currentPage * pageSize;
  const visibleBriefings = briefings.slice(startIndex, startIndex + pageSize);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        onSelect(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelect(Math.min(briefings.length - 1, selectedIndex + 1));
      } else if (key.pageDown) {
        onSelect(Math.min(briefings.length - 1, selectedIndex + pageSize));
      } else if (key.pageUp) {
        onSelect(Math.max(0, selectedIndex - pageSize));
      }
    },
    { isActive: isFocused }
  );

  if (briefings.length === 0) {
    return (
      <Box paddingY={1}>
        <Text dimColor>No briefings drafted. Press 'n' to draft a new issue.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" gap={0}>
        {visibleBriefings.map((b, idx) => {
          const actualIndex = startIndex + idx;
          const isSelected = actualIndex === selectedIndex;

          return (
            <Box key={b.id} justifyContent="space-between">
              <Text
                bold={isSelected}
                color={!isNoColor && isSelected ? colors.primary : undefined}
              >
                {isSelected ? "▶ " : "  "}#{b.issueNumber || "—"} {b.title.slice(0, 10)}
              </Text>
              <TextStatusBadge status={b.status} />
            </Box>
          );
        })}
      </Box>

      {/* Pagination Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          {startIndex + 1}–{Math.min(startIndex + pageSize, briefings.length)} of {briefings.length}
        </Text>
        <Text dimColor>
          P.{currentPage + 1}/{totalPages}
        </Text>
      </Box>
    </Box>
  );
};

// Backwards-compatible alias
export const NewsletterListView = BriefingListView;
