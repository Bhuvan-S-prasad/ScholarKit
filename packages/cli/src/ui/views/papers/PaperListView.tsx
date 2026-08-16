import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { PaperWithExtraction } from "../../contexts/AppStateContext.js";
import { TextStatusBadge } from "../../components/common/TextStatusBadge.js";
import { useTheme } from "../../contexts/ThemeContext.js";

export interface PaperListViewProps {
  papers: PaperWithExtraction[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isFocused: boolean;
  pageSize?: number;
}

export const PaperListView: React.FC<PaperListViewProps> = ({
  papers,
  selectedIndex,
  onSelect,
  isFocused,
  pageSize = 7,
}) => {
  const { colors, isNoColor } = useTheme();
  const [filterMode, setFilterMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  // Debounce search input (150ms) to avoid re-rendering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter papers
  const filteredPapers = useMemo(() => {
    if (!debouncedQuery.trim()) return papers;
    const lower = debouncedQuery.toLowerCase();
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(lower) ||
        p.sourceId.toLowerCase().includes(lower) ||
        p.authors.some((a) => a.toLowerCase().includes(lower))
    );
  }, [papers, debouncedQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredPapers.length / pageSize));
  const currentPage = Math.min(
    totalPages - 1,
    Math.max(0, Math.floor(selectedIndex / pageSize))
  );
  const startIndex = currentPage * pageSize;
  const visiblePapers = filteredPapers.slice(startIndex, startIndex + pageSize);

  // Keyboard navigation when focused
  useInput(
    (input, key) => {
      if (filterMode) {
        if (key.escape || key.return) {
          setFilterMode(false);
        }
        return;
      }

      if (input === "/") {
        setFilterMode(true);
        return;
      }

      if (key.upArrow) {
        onSelect(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelect(Math.min(filteredPapers.length - 1, selectedIndex + 1));
      } else if (key.pageDown) {
        onSelect(Math.min(filteredPapers.length - 1, selectedIndex + pageSize));
      } else if (key.pageUp) {
        onSelect(Math.max(0, selectedIndex - pageSize));
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Search / Filter Bar */}
      {filterMode ? (
        <Box marginBottom={1} borderStyle="single" borderColor={isNoColor ? undefined : colors.primary} paddingX={1}>
          <Text color={isNoColor ? undefined : colors.primary} bold>
            Filter:{" "}
          </Text>
          <TextInput
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={() => setFilterMode(false)}
            placeholder="Type arXiv ID or keyword..."
          />
        </Box>
      ) : searchQuery ? (
        <Box marginBottom={1} justifyContent="space-between">
          <Text dimColor>Filter: "{searchQuery}"</Text>
          <Text dimColor>[Press / to edit, Esc to clear]</Text>
        </Box>
      ) : null}

      {/* Paginated List */}
      {filteredPapers.length === 0 ? (
        <Box paddingY={1}>
          <Text dimColor>
            {searchQuery ? "No matching papers found." : "No papers in database. Press 'i' to ingest."}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={0}>
          {visiblePapers.map((paper, idx) => {
            const actualIndex = startIndex + idx;
            const isSelected = actualIndex === selectedIndex;

            return (
              <Box
                key={paper.id}
                justifyContent="space-between"
                paddingX={0}
              >
                <Box gap={1}>
                  <Text
                    bold={isSelected}
                    color={!isNoColor && isSelected ? colors.primary : undefined}
                  >
                    {isSelected ? "▶" : " "} {paper.sourceId.slice(0, 13)}
                  </Text>
                  <Text dimColor>{paper.title.slice(0, 10)}..</Text>
                </Box>
                <TextStatusBadge status={paper.status} />
              </Box>
            );
          })}
        </Box>
      )}

      {/* Pagination Footer */}
      {filteredPapers.length > 0 && (
        <Box marginTop={1} justifyContent="space-between">
          <Text dimColor>
            Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredPapers.length)} of {filteredPapers.length}
          </Text>
          <Text dimColor>
            Page {currentPage + 1}/{totalPages} [/ Filter]
          </Text>
        </Box>
      )}
    </Box>
  );
};
