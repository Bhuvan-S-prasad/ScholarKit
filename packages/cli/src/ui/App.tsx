import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { ThemeProvider } from "./contexts/ThemeContext.js";
import { AppStateProvider, useAppState } from "./contexts/AppStateContext.js";
import { Header } from "./components/layout/Header.js";
import { TabBar } from "./components/layout/TabBar.js";
import { Footer } from "./components/layout/Footer.js";
import { FocusedPanel } from "./components/layout/FocusedPanel.js";
import { TextStatusBadge } from "./components/common/TextStatusBadge.js";
import { ConfidenceMeter } from "./components/common/ConfidenceMeter.js";
import { StatusSpinner } from "./components/common/StatusSpinner.js";

export type TabId = "papers" | "reviews" | "newsletters";

export interface AppProps {
  initialTab?: TabId;
}

const MainView: React.FC<{ initialTab: TabId }> = ({ initialTab }) => {
  const { exit } = useApp();
  const { papers, projects, newsletters, loading, error, refreshAll } = useAppState();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Global key bindings
  useInput((input, key) => {
    if (input === "q" || input === "Q") {
      exit();
      return;
    }
    if (input === "1") {
      setActiveTab("papers");
      setSelectedIndex(0);
    } else if (input === "2") {
      setActiveTab("reviews");
      setSelectedIndex(0);
    } else if (input === "3") {
      setActiveTab("newsletters");
      setSelectedIndex(0);
    } else if (key.tab) {
      setActivePane((prev) => (prev === "left" ? "right" : "left"));
    } else if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      const currentListLength =
        activeTab === "papers"
          ? papers.length
          : activeTab === "reviews"
            ? projects.length
            : newsletters.length;
      setSelectedIndex((prev) => Math.min(Math.max(0, currentListLength - 1), prev + 1));
    } else if (input === "R") {
      refreshAll();
    }
  });

  const activeTabTitle =
    activeTab === "papers"
      ? "Research Papers"
      : activeTab === "reviews"
        ? "Literature Reviews"
        : "Newsletters & Publishing";

  const selectedPaper = papers[selectedIndex] || null;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* 1. Header Bar */}
      <Header activeTabTitle={activeTabTitle} />

      {/* 2. Tab Bar */}
      <TabBar activeTab={activeTab} />

      {/* 3. Main Dual-Pane Master-Detail Area */}
      <Box height={16} gap={1}>
        {/* Left Master List Pane */}
        <FocusedPanel
          title={
            activeTab === "papers"
              ? `Papers (${papers.length})`
              : activeTab === "reviews"
                ? `Projects (${projects.length})`
                : `Issues (${newsletters.length})`
          }
          width="35%"
          isFocused={activePane === "left"}
        >
          {loading ? (
            <StatusSpinner label="Syncing with Neon DB..." />
          ) : error ? (
            <Text color="red">{error}</Text>
          ) : activeTab === "papers" ? (
            papers.length === 0 ? (
              <Text dimColor>No papers found. Press 'i' to ingest.</Text>
            ) : (
              <Box flexDirection="column">
                {papers.slice(0, 8).map((p, idx) => (
                  <Box key={p.id} justifyContent="space-between">
                    <Text bold={idx === selectedIndex} color={idx === selectedIndex ? "cyan" : undefined}>
                      {idx === selectedIndex ? "▶ " : "  "}
                      {p.sourceId}
                    </Text>
                    <TextStatusBadge status={p.status} />
                  </Box>
                ))}
              </Box>
            )
          ) : activeTab === "reviews" ? (
            projects.length === 0 ? (
              <Text dimColor>No review projects found.</Text>
            ) : (
              <Box flexDirection="column">
                {projects.slice(0, 8).map((proj, idx) => (
                  <Box key={proj.id} justifyContent="space-between">
                    <Text bold={idx === selectedIndex} color={idx === selectedIndex ? "cyan" : undefined}>
                      {idx === selectedIndex ? "▶ " : "  "}
                      {proj.title.slice(0, 16)}
                    </Text>
                    <TextStatusBadge status={proj.status} />
                  </Box>
                ))}
              </Box>
            )
          ) : newsletters.length === 0 ? (
            <Text dimColor>No newsletters drafted.</Text>
          ) : (
            <Box flexDirection="column">
              {newsletters.slice(0, 8).map((nl, idx) => (
                <Box key={nl.id} justifyContent="space-between">
                  <Text bold={idx === selectedIndex} color={idx === selectedIndex ? "cyan" : undefined}>
                    {idx === selectedIndex ? "▶ " : "  "}#{nl.issueNumber || "—"} {nl.title.slice(0, 14)}
                  </Text>
                  <TextStatusBadge status={nl.status} />
                </Box>
              ))}
            </Box>
          )}
        </FocusedPanel>

        {/* Right Detail Pane */}
        <FocusedPanel
          title="Details & Inspection"
          width="65%"
          isFocused={activePane === "right"}
        >
          {activeTab === "papers" && selectedPaper ? (
            <Box flexDirection="column" gap={1}>
              <Text bold color="cyan">
                {selectedPaper.title}
              </Text>
              <Text dimColor>
                Authors: {selectedPaper.authors.slice(0, 3).join(", ")} | Date: {selectedPaper.publishedDate}
              </Text>
              {selectedPaper.extraction ? (
                <Box flexDirection="column" gap={1}>
                  <Box gap={1}>
                    <Text bold>Confidence:</Text>
                    <ConfidenceMeter score={selectedPaper.extraction.confidence} />
                  </Box>
                  <Box flexDirection="column">
                    <Text bold>Methodology:</Text>
                    <Text dimColor>
                      {selectedPaper.extraction.methodology
                        ? (selectedPaper.extraction.methodology as any).approach || "Standard computational approach"
                        : "N/A"}
                    </Text>
                  </Box>
                </Box>
              ) : (
                <Box flexDirection="column">
                  <Text dimColor>Status: {selectedPaper.status} (No structured extraction yet)</Text>
                  <Text dimColor>Abstract: {selectedPaper.abstract.slice(0, 200)}...</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text dimColor>Select an item from the left pane to view structured details.</Text>
            </Box>
          )}
        </FocusedPanel>
      </Box>

      {/* 4. Footer Hotkeys Bar */}
      <Footer customHotkeys={[{ key: "R", label: "Refresh DB" }]} />
    </Box>
  );
};

export const App: React.FC<AppProps> = ({ initialTab = "papers" }) => {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <MainView initialTab={initialTab} />
      </AppStateProvider>
    </ThemeProvider>
  );
};
