import React from "react";
import { Box, Text, useInput } from "ink";
import { ProjectWithEntries } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface ReviewListViewProps {
  projects: ProjectWithEntries[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isFocused: boolean;
  pageSize?: number;
}

export const ReviewListView: React.FC<ReviewListViewProps> = ({
  projects,
  selectedIndex,
  onSelect,
  isFocused,
  pageSize = 7,
}) => {
  const { colors, isNoColor } = useTheme();

  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize));
  const currentPage = Math.min(
    totalPages - 1,
    Math.max(0, Math.floor(selectedIndex / pageSize))
  );
  const startIndex = currentPage * pageSize;
  const visibleProjects = projects.slice(startIndex, startIndex + pageSize);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        onSelect(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelect(Math.min(projects.length - 1, selectedIndex + 1));
      } else if (key.pageDown) {
        onSelect(Math.min(projects.length - 1, selectedIndex + pageSize));
      } else if (key.pageUp) {
        onSelect(Math.max(0, selectedIndex - pageSize));
      }
    },
    { isActive: isFocused }
  );

  if (projects.length === 0) {
    return (
      <Box paddingY={1}>
        <Text dimColor>No review projects found. Press 'c' to create a new project.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" gap={0}>
        {visibleProjects.map((project, idx) => {
          const actualIndex = startIndex + idx;
          const isSelected = actualIndex === selectedIndex;

          return (
            <Box key={project.id} justifyContent="space-between">
              <Text
                bold={isSelected}
                color={!isNoColor && isSelected ? colors.primary : undefined}
              >
                {isSelected ? "▶ " : "  "}{project.title.slice(0, 12)}
              </Text>
              <TextStatusBadge status={project.status} />
            </Box>
          );
        })}
      </Box>

      {/* Pagination Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          {startIndex + 1}–{Math.min(startIndex + pageSize, projects.length)} of {projects.length}
        </Text>
        <Text dimColor>
          P.{currentPage + 1}/{totalPages}
        </Text>
      </Box>
    </Box>
  );
};
