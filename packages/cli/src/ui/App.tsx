import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  extractPaperData,
  createStubExtraction,
  evaluateExtractionConfidence,
  createOpenRouterClient,
  PaperMetadata,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { ThemeProvider } from "./contexts/ThemeContext.js";
import { AppStateProvider, useAppState } from "./contexts/AppStateContext.js";
import { Header } from "./components/layout/Header.js";
import { TabBar } from "./components/layout/TabBar.js";
import { Footer } from "./components/layout/Footer.js";
import { FocusedPanel } from "./components/layout/FocusedPanel.js";
import { TextStatusBadge } from "./components/common/TextStatusBadge.js";
import { StatusSpinner } from "./components/common/StatusSpinner.js";
import { PaperListView } from "./views/papers/PaperListView.js";
import { PaperDetailView } from "./views/papers/PaperDetailView.js";
import { IngestModal } from "./views/papers/IngestModal.js";

export type TabId = "papers" | "reviews" | "newsletters";

export interface AppProps {
  initialTab?: TabId;
}

const MainView: React.FC<{ initialTab: TabId }> = ({ initialTab }) => {
  const { exit } = useApp();
  const { papers, projects, newsletters, loading, error, refreshAll, refreshPapers } = useAppState();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Ingestion and extraction state
  const [isIngestModalOpen, setIsIngestModalOpen] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<string>("");

  const selectedPaper = papers[selectedIndex] || null;

  // Extraction handler
  const handleExtractPaper = async (useStub: boolean) => {
    if (!selectedPaper || isExtracting) return;
    setIsExtracting(true);

    try {
      const paperMeta: PaperMetadata = {
        id: selectedPaper.id,
        title: selectedPaper.title,
        authors: selectedPaper.authors,
        abstract: selectedPaper.abstract,
        publishedDate: selectedPaper.publishedDate,
        source: selectedPaper.source,
        sourceId: selectedPaper.sourceId,
        url: selectedPaper.url,
        pdfUrl: selectedPaper.pdfUrl || undefined,
        categories: selectedPaper.categories,
        status: selectedPaper.status,
      };

      let extractionResult;
      if (useStub) {
        setExtractionProgress("Running deterministic offline stub extraction...");
        extractionResult = createStubExtraction(paperMeta);
      } else {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const model = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";
        if (!apiKey) {
          setExtractionProgress("OPENROUTER_API_KEY missing. Falling back to stub extraction...");
          extractionResult = createStubExtraction(paperMeta);
        } else {
          setExtractionProgress(`Extracting via OpenRouter (${model})...`);
          const llm = createOpenRouterClient({ apiKey, defaultModel: model });
          const content = selectedPaper.rawContent || selectedPaper.abstract;
          extractionResult = await extractPaperData(paperMeta, content, llm);
        }
      }

      setExtractionProgress("Validating confidence and saving to Neon DB...");
      evaluateExtractionConfidence(extractionResult);

      await prisma.paperExtraction.upsert({
        where: { paperId: selectedPaper.id },
        create: {
          paperId: selectedPaper.id,
          methodology: extractionResult.methodology,
          keyFindings: extractionResult.keyFindings,
          contributions: extractionResult.contributions,
          limitations: extractionResult.limitations,
          confidence: extractionResult.confidence,
          extractionNotes: extractionResult.extractionNotes,
          extractedAt: new Date(extractionResult.extractedAt || Date.now()),
        },
        update: {
          methodology: extractionResult.methodology,
          keyFindings: extractionResult.keyFindings,
          contributions: extractionResult.contributions,
          limitations: extractionResult.limitations,
          confidence: extractionResult.confidence,
          extractionNotes: extractionResult.extractionNotes,
          extractedAt: new Date(extractionResult.extractedAt || Date.now()),
        },
      });

      await prisma.paper.update({
        where: { id: selectedPaper.id },
        data: { status: "extracted" },
      });

      await refreshPapers();
    } finally {
      setIsExtracting(false);
      setExtractionProgress("");
    }
  };

  // Global key bindings
  useInput(
    (input, key) => {
      if (isIngestModalOpen || isExtracting) return;

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
      } else if (input === "R") {
        refreshAll();
      } else if (activeTab === "papers") {
        if (input === "i" || input === "I") {
          setIsIngestModalOpen(true);
        } else if (input === "e" || input === "E") {
          handleExtractPaper(false);
        } else if (input === "s" || input === "S") {
          handleExtractPaper(true);
        }
      }
    },
    { isActive: !isIngestModalOpen && !isExtracting }
  );

  const activeTabTitle =
    activeTab === "papers"
      ? "Research Papers"
      : activeTab === "reviews"
        ? "Literature Reviews"
        : "Newsletters & Publishing";

  const customHotkeys =
    activeTab === "papers"
      ? [
          { key: "i", label: "Ingest arXiv" },
          { key: "e", label: "Extract (LLM)" },
          { key: "s", label: "Stub Extract" },
          { key: "R", label: "Refresh" },
        ]
      : [{ key: "R", label: "Refresh" }];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* 1. Header Bar */}
      <Header activeTabTitle={activeTabTitle} />

      {/* 2. Tab Bar */}
      <TabBar activeTab={activeTab} />

      {/* Ingest Modal (Conditional) */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onSuccess={refreshPapers}
      />

      {/* 3. Main Dual-Pane Master-Detail Area */}
      {!isIngestModalOpen && (
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
              <PaperListView
                papers={papers}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                isFocused={activePane === "left"}
              />
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
            title={activeTab === "papers" ? "Paper Inspection" : "Details & Inspection"}
            width="65%"
            isFocused={activePane === "right"}
          >
            {activeTab === "papers" ? (
              <PaperDetailView
                paper={selectedPaper}
                extracting={isExtracting}
                extractionProgressText={extractionProgress}
              />
            ) : (
              <Box flexDirection="column">
                <Text dimColor>Select an item from the left pane to view structured details.</Text>
              </Box>
            )}
          </FocusedPanel>
        </Box>
      )}

      {/* 4. Footer Hotkeys Bar */}
      <Footer customHotkeys={customHotkeys} />
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
