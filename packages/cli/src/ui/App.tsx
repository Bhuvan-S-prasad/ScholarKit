import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  extractPaperData,
  createStubExtraction,
  evaluateExtractionConfidence,
  classifyAndRankPapers,
  createOpenRouterClient,
  createMockLLMClient,
  PaperMetadata,
  LitReviewProject,
  SCHOLARKIT_CONFIG,
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
import { ReviewListView } from "./views/reviews/ReviewListView.js";
import { ReviewDetailView } from "./views/reviews/ReviewDetailView.js";
import { CreateReviewModal } from "./views/reviews/CreateReviewModal.js";
import { ReviewDraftModal } from "./views/reviews/ReviewDraftModal.js";
import { NewsletterListView } from "./views/newsletters/NewsletterListView.js";
import { NewsletterDetailView } from "./views/newsletters/NewsletterDetailView.js";
import { TransitionDialog } from "./views/newsletters/TransitionDialog.js";
import { TelegramPreviewModal } from "./views/newsletters/TelegramPreviewModal.js";
import { CreateNewsletterModal } from "./views/newsletters/CreateNewsletterModal.js";

export type TabId = "papers" | "reviews" | "newsletters";

export interface AppProps {
  initialTab?: TabId;
}

const MainView: React.FC<{ initialTab: TabId }> = ({ initialTab }) => {
  const { exit } = useApp();
  const {
    papers,
    projects,
    newsletters,
    loading,
    error,
    refreshAll,
    refreshPapers,
    refreshProjects,
    refreshNewsletters,
  } = useAppState();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Paper modals & action states
  const [isIngestModalOpen, setIsIngestModalOpen] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<string>("");

  // Review modals & action states
  const [isCreateReviewOpen, setIsCreateReviewOpen] = useState<boolean>(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState<boolean>(false);
  const [isRanking, setIsRanking] = useState<boolean>(false);
  const [rankingProgress, setRankingProgress] = useState<string>("");

  // Newsletter modals & action states
  const [isCreateNewsletterOpen, setIsCreateNewsletterOpen] = useState<boolean>(false);
  const [isTransitionOpen, setIsTransitionOpen] = useState<boolean>(false);
  const [isTelegramPreviewOpen, setIsTelegramPreviewOpen] = useState<boolean>(false);

  // Action error state
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedPaper = papers[selectedIndex] || null;
  const selectedProject = projects[selectedIndex] || null;
  const selectedNewsletter = newsletters[selectedIndex] || null;

  // Extraction handler
  const handleExtractPaper = async (useStub: boolean) => {
    if (!selectedPaper || isExtracting) return;
    setIsExtracting(true);
    setActionError(null);

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
        const model = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;
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
    } catch (err) {
      setActionError(`Extraction failed: ${(err as Error).message}`);
    } finally {
      setIsExtracting(false);
      setExtractionProgress("");
    }
  };

  // Ranking handler for literature review
  const handleRankPapers = async () => {
    if (!selectedProject || isRanking || papers.length === 0) return;
    setIsRanking(true);
    setActionError(null);
    setRankingProgress(`Ranking ${papers.length} paper(s) against query...`);

    try {
      const paperMetas: PaperMetadata[] = papers.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        abstract: p.abstract,
        publishedDate: p.publishedDate,
        source: p.source,
        sourceId: p.sourceId,
        url: p.url,
        pdfUrl: p.pdfUrl || undefined,
        categories: p.categories,
        status: p.status,
      }));

      const projectDomain: LitReviewProject = {
        id: selectedProject.id,
        title: selectedProject.title,
        description: selectedProject.description || undefined,
        query: selectedProject.query,
        inclusionCriteria: selectedProject.inclusionCriteria,
        exclusionCriteria: selectedProject.exclusionCriteria,
        status: selectedProject.status as any,
      };

      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;

      let entries;
      if (apiKey) {
        setRankingProgress(`Classifying relevance via OpenRouter (${model})...`);
        const llm = createOpenRouterClient({ apiKey, defaultModel: model });
        entries = await classifyAndRankPapers(projectDomain, paperMetas, llm);
      } else {
        const mockLLM = createMockLLMClient({
          onStructured: () => ({
            evaluations: papers.map((p) => ({
              paperId: p.id,
              relevanceScore: 0.88,
              classification: "highly_relevant",
              reasonForScore: "Direct match on methodology and research query terms.",
            })),
          }),
        });
        entries = await classifyAndRankPapers(projectDomain, paperMetas, mockLLM);
      }

      setRankingProgress("Saving ranked entries to Neon DB...");
      for (const entry of entries) {
        await prisma.litReviewEntry.upsert({
          where: {
            projectId_paperId: {
              projectId: selectedProject.id,
              paperId: entry.paperId,
            },
          },
          create: {
            projectId: selectedProject.id,
            paperId: entry.paperId,
            relevanceScore: entry.relevanceScore,
            classification: entry.classification,
            reasonForScore: entry.reasonForScore,
            notes: entry.notes,
          },
          update: {
            relevanceScore: entry.relevanceScore,
            classification: entry.classification,
            reasonForScore: entry.reasonForScore,
            notes: entry.notes,
          },
        });
      }

      await refreshProjects();
    } catch (err) {
      setActionError(`Ranking failed: ${(err as Error).message}`);
    } finally {
      setIsRanking(false);
      setRankingProgress("");
    }
  };

  const handleSearchArxivForReview = async () => {
    if (!selectedProject) return;

    try {
      setIsRanking(true);
      setActionError(null);
      setRankingProgress(`[1/3] Searching arXiv for "${selectedProject.query}"...`);

      const { searchArxivPapers } = await import("@scholarkit/core");
      const searchResults = await searchArxivPapers(selectedProject.query, { maxResults: 6 });

      if (searchResults.length === 0) {
        setActionError("No papers found on arXiv for this query.");
        return;
      }

      setRankingProgress(`[2/3] Found ${searchResults.length} papers. Deduplicating...`);
      const existing = await prisma.paper.findMany({
        where: { sourceId: { in: searchResults.map((p) => p.sourceId) } },
      });
      const existingIds = new Set(existing.map((p) => p.sourceId));
      const newPapers = searchResults.filter((p) => !existingIds.has(p.sourceId));

      for (const p of newPapers) {
        await prisma.paper.create({
          data: {
            title: p.title,
            authors: p.authors,
            abstract: p.abstract,
            publishedDate: p.publishedDate,
            source: p.source,
            sourceId: p.sourceId,
            url: p.url,
            pdfUrl: p.pdfUrl,
            categories: p.categories,
            status: p.status,
          },
        });
      }

      await refreshPapers();
      setRankingProgress(`[3/3] Ranking papers against project criteria...`);
      await handleRankPapers();
    } catch (err) {
      setActionError(`arXiv search failed: ${(err as Error).message}`);
    } finally {
      setIsRanking(false);
      setRankingProgress("");
    }
  };

  const handleBridgeReviewToNewsletter = async () => {
    if (!selectedProject) return;

    try {
      setActionError(null);
      const { createNewsletterFromLiteratureReview, buildLiteratureReviewDraft } = await import("@scholarkit/core");

      const projectDomain: LitReviewProject = {
        id: selectedProject.id,
        title: selectedProject.title,
        description: selectedProject.description || undefined,
        query: selectedProject.query,
        inclusionCriteria: selectedProject.inclusionCriteria,
        exclusionCriteria: selectedProject.exclusionCriteria,
        status: selectedProject.status as any,
      };

      const entriesWithPapers = selectedProject.entries.map((e) => ({
        entry: {
          id: e.id,
          projectId: e.projectId,
          paperId: e.paperId,
          relevanceScore: e.relevanceScore,
          classification: e.classification as any,
          reasonForScore: e.reasonForScore,
          notes: e.notes || undefined,
          createdAt: e.createdAt.toISOString(),
        },
        paper: {
          id: e.paper.id,
          title: e.paper.title,
          authors: e.paper.authors,
          abstract: e.paper.abstract,
          publishedDate: e.paper.publishedDate,
          source: e.paper.source as any,
          sourceId: e.paper.sourceId,
          url: e.paper.url,
          pdfUrl: e.paper.pdfUrl || undefined,
          categories: e.paper.categories,
          status: e.paper.status as any,
          rawContent: e.paper.rawContent || undefined,
          createdAt: e.paper.createdAt.toISOString(),
          updatedAt: e.paper.updatedAt.toISOString(),
        },
      }));

      const apiKey = process.env.OPENROUTER_API_KEY;
      const defaultModel = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;

      let draftResult;
      if (apiKey) {
        const llm = createOpenRouterClient({ apiKey, defaultModel });
        draftResult = await buildLiteratureReviewDraft(projectDomain, entriesWithPapers, llm);
      } else {
        draftResult = {
          title: `Literature Review: ${selectedProject.title}`,
          abstractOrExecutiveSummary: `Synthesis of key contributions across ${entriesWithPapers.length} analyzed works on ${selectedProject.query}.`,
          sections: [
            {
              title: "Architectural & Methodological Highlights",
              content: "Recent research emphasizes compute optimization and sparse execution to maximize throughput.",
              citedPaperIds: entriesWithPapers.map((e) => e.paper.sourceId),
            },
          ],
          researchGapsIdentified: ["Standardized benchmark evaluations across heterogeneous infrastructure"],
          conclusion: "The literature demonstrates a clear trend toward hardware-aware serving systems.",
          generatedAt: new Date().toISOString(),
        };
      }

      const topPapers = entriesWithPapers.map((e) => e.paper as PaperMetadata);
      const nextIssue = newsletters.length + 1;
      const newsletterDraft = createNewsletterFromLiteratureReview(projectDomain, draftResult, topPapers, {
        issueNumber: nextIssue,
      });

      await prisma.newsletter.create({
        data: {
          title: newsletterDraft.title,
          issueNumber: newsletterDraft.issueNumber,
          contentType: newsletterDraft.contentType,
          status: newsletterDraft.status,
          target: newsletterDraft.target,
          sections: {
            create: newsletterDraft.sections.map((s) => ({
              title: s.title,
              content: s.content,
              order: s.order,
              sectionType: s.sectionType,
              paperReferences: s.paperReferences,
            })),
          },
        },
      });

      await refreshNewsletters();
      setActiveTab("newsletters");
      setSelectedIndex(0);
    } catch (err) {
      setActionError(`Bridge to newsletter failed: ${(err as Error).message}`);
    }
  };

  const isDevMode = Boolean(
    process.argv.includes("--dev") || process.env.SCHOLARKIT_DEV === "1"
  );

  const isAnyModalOpen =
    isIngestModalOpen ||
    isCreateReviewOpen ||
    isDraftModalOpen ||
    isCreateNewsletterOpen ||
    isTransitionOpen ||
    isTelegramPreviewOpen;

  const isBusy = isExtracting || isRanking;

  // Global key bindings
  useInput(
    (input, key) => {
      if (isAnyModalOpen || isBusy) return;

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
        } else if ((input === "s" || input === "S") && isDevMode) {
          handleExtractPaper(true);
        }
      } else if (activeTab === "reviews") {
        if (input === "c" || input === "C") {
          setIsCreateReviewOpen(true);
        } else if (input === "s" || input === "S") {
          handleSearchArxivForReview();
        } else if (input === "r" || input === "R") {
          handleRankPapers();
        } else if (input === "d" || input === "D") {
          if (selectedProject && selectedProject.entries.length > 0) {
            setIsDraftModalOpen(true);
          }
        } else if (input === "N") {
          handleBridgeReviewToNewsletter();
        }
      } else if (activeTab === "newsletters") {
        if (input === "n" || input === "N") {
          setIsCreateNewsletterOpen(true);
        } else if (input === "t" || input === "T") {
          if (selectedNewsletter) {
            setIsTransitionOpen(true);
          }
        } else if (input === "p" || input === "P") {
          if (selectedNewsletter) {
            setIsTelegramPreviewOpen(true);
          }
        }
      }
    },
    { isActive: !isAnyModalOpen && !isBusy }
  );

  const activeTabTitle =
    activeTab === "papers"
      ? "Research Papers"
      : activeTab === "reviews"
        ? "Literature Reviews"
        : "Newsletters & Publishing";

  const paperHotkeys = [
    { key: "i", label: "Ingest arXiv" },
    { key: "e", label: "Extract (LLM)" },
    ...(isDevMode ? [{ key: "s", label: "Stub Extract" }] : []),
    { key: "R", label: "Refresh" },
  ];

  const reviewHotkeys = [
    { key: "c", label: "New Project" },
    { key: "s", label: "Search arXiv" },
    { key: "r", label: "Rank Papers" },
    { key: "d", label: "Draft Review" },
    { key: "N", label: "To Newsletter" },
    { key: "R", label: "Refresh" },
  ];

  const customHotkeys =
    activeTab === "papers"
      ? paperHotkeys
      : activeTab === "reviews"
        ? reviewHotkeys
        : [
            { key: "n", label: "New Issue" },
            { key: "t", label: "Transition" },
            { key: "p", label: "Telegram Preview" },
            { key: "R", label: "Refresh" },
          ];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* 1. Header Bar */}
      <Header activeTabTitle={activeTabTitle} />

      {/* 2. Tab Bar */}
      <TabBar activeTab={activeTab} />

      {/* Paper Modals */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onSuccess={refreshPapers}
      />

      {/* Review Modals */}
      <CreateReviewModal
        isOpen={isCreateReviewOpen}
        onClose={() => setIsCreateReviewOpen(false)}
        onSuccess={refreshProjects}
      />
      <ReviewDraftModal
        project={selectedProject}
        isOpen={isDraftModalOpen}
        onClose={() => setIsDraftModalOpen(false)}
      />

      {/* Newsletter Modals */}
      <CreateNewsletterModal
        isOpen={isCreateNewsletterOpen}
        onClose={() => setIsCreateNewsletterOpen(false)}
        onSuccess={refreshNewsletters}
      />
      <TransitionDialog
        newsletter={selectedNewsletter}
        isOpen={isTransitionOpen}
        onClose={() => setIsTransitionOpen(false)}
        onSuccess={refreshNewsletters}
      />
      <TelegramPreviewModal
        newsletter={selectedNewsletter}
        isOpen={isTelegramPreviewOpen}
        onClose={() => setIsTelegramPreviewOpen(false)}
        onSuccess={refreshNewsletters}
      />

      {/* 3. Main Dual-Pane Master-Detail Area */}
      {!isAnyModalOpen && (
        <Box gap={1}>
          {/* Left Master List Pane */}
          <FocusedPanel
            title={
              activeTab === "papers"
                ? `Papers (${papers.length})`
                : activeTab === "reviews"
                  ? `Projects (${projects.length})`
                  : `Issues (${newsletters.length})`
            }
            width={28}
            isFocused={activePane === "left"}
          >
            {loading ? (
              <StatusSpinner label="Syncing..." />
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
              <ReviewListView
                projects={projects}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                isFocused={activePane === "left"}
              />
            ) : (
              <NewsletterListView
                newsletters={newsletters}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                isFocused={activePane === "left"}
              />
            )}
          </FocusedPanel>

          {/* Right Detail Pane */}
          <FocusedPanel
            title={
              activeTab === "papers"
                ? "Paper Inspection"
                : activeTab === "reviews"
                  ? "Project & Ranked Matrix"
                  : "Issue Details & Workflow"
            }
            flexGrow={1}
            isFocused={activePane === "right"}
          >
            {activeTab === "papers" ? (
              <PaperDetailView
                paper={selectedPaper}
                extracting={isExtracting}
                extractionProgressText={extractionProgress}
                error={actionError}
                isDevMode={isDevMode}
              />
            ) : activeTab === "reviews" ? (
              <ReviewDetailView
                project={selectedProject}
                ranking={isRanking}
                rankingProgressText={rankingProgress}
              />
            ) : (
              <NewsletterDetailView newsletter={selectedNewsletter} />
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
