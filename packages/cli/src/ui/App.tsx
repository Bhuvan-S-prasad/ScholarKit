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
  WorkflowAction,
  SCHOLARKIT_CONFIG,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { ThemeProvider } from "./contexts/ThemeContext.js";
import { AppStateProvider, useAppState } from "./contexts/AppStateContext.js";
import { Header } from "./components/layout/Header.js";
import { TabBar } from "./components/layout/TabBar.js";
import { Footer } from "./components/layout/Footer.js";
import { FocusedPanel } from "./components/layout/FocusedPanel.js";
import { StatusSpinner } from "./components/common/StatusSpinner.js";
import { PaperListView } from "./views/papers/PaperListView.js";
import { PaperDetailView } from "./views/papers/PaperDetailView.js";
import { IngestModal } from "./views/papers/IngestModal.js";
import { ReviewListView } from "./views/reviews/ReviewListView.js";
import { ReviewDetailView } from "./views/reviews/ReviewDetailView.js";
import { CreateReviewModal } from "./views/reviews/CreateReviewModal.js";
import { ReviewDraftModal } from "./views/reviews/ReviewDraftModal.js";
import { BriefingListView } from "./views/briefings/BriefingListView.js";
import { BriefingDetailView } from "./views/briefings/BriefingDetailView.js";
import { TransitionDialog } from "./views/briefings/TransitionDialog.js";
import { TelegramPreviewModal } from "./views/briefings/TelegramPreviewModal.js";
import { CreateBriefingModal } from "./views/briefings/CreateBriefingModal.js";

export type TabId = "papers" | "reviews" | "briefings";

export interface AppProps {
  initialTab?: TabId | "newsletters";
}

const MainView: React.FC<{ initialTab: TabId | "newsletters" }> = ({ initialTab }) => {
  const { exit } = useApp();
  const {
    papers,
    projects,
    briefings,
    loading,
    error,
    refreshAll,
    refreshPapers,
    refreshProjects,
    refreshBriefings,
  } = useAppState();

  const normalizedTab: TabId = (initialTab === "newsletters" ? "briefings" : initialTab) || "papers";
  const [activeTab, setActiveTab] = useState<TabId>(normalizedTab);
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

  // Briefing modals & workflow action states
  const [isCreateBriefingOpen, setIsCreateBriefingOpen] = useState<boolean>(false);
  const [isTransitionOpen, setIsTransitionOpen] = useState<boolean>(false);
  const [isTelegramPreviewOpen, setIsTelegramPreviewOpen] = useState<boolean>(false);

  const [actionError, setActionError] = useState<string | null>(null);

  // Selected entities based on active tab and index
  const selectedPaper = papers[selectedIndex] || null;
  const selectedProject = projects[selectedIndex] || null;
  const selectedBriefing = briefings[selectedIndex] || null;

  // Actions
  const handleExtractPaper = async (useStub = false) => {
    if (!selectedPaper) return;

    try {
      setIsExtracting(true);
      setActionError(null);
      setExtractionProgress("Reading paper abstract and structure...");

      const paperDomain: PaperMetadata = {
        id: selectedPaper.id,
        title: selectedPaper.title,
        authors: selectedPaper.authors,
        abstract: selectedPaper.abstract,
        publishedDate: selectedPaper.publishedDate,
        source: selectedPaper.source as any,
        sourceId: selectedPaper.sourceId,
        url: selectedPaper.url,
        pdfUrl: selectedPaper.pdfUrl || undefined,
        categories: selectedPaper.categories,
        status: selectedPaper.status as any,
        rawContent: selectedPaper.rawContent || undefined,
        createdAt: selectedPaper.createdAt.toISOString(),
        updatedAt: selectedPaper.updatedAt.toISOString(),
      };

      let extractionData;
      if (useStub) {
        setExtractionProgress("Running deterministic stub extraction...");
        extractionData = createStubExtraction(paperDomain);
      } else {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const defaultModel = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;

        const content = selectedPaper.rawContent || selectedPaper.abstract;
        if (apiKey) {
          setExtractionProgress(`Invoking OpenRouter model (${defaultModel})...`);
          const llm = createOpenRouterClient({ apiKey, defaultModel });
          extractionData = await extractPaperData(paperDomain, content, llm);
        } else {
          setExtractionProgress("No API key found. Using mock LLM client...");
          const mockLLM = createMockLLMClient();
          extractionData = await extractPaperData(paperDomain, content, mockLLM);
        }
      }

      setExtractionProgress("Evaluating confidence score...");
      const confScore = evaluateExtractionConfidence(extractionData);

      setExtractionProgress("Persisting extraction to Neon DB...");
      await prisma.paperExtraction.upsert({
        where: { paperId: selectedPaper.id },
        create: {
          paperId: selectedPaper.id,
          methodology: extractionData.methodology,
          keyFindings: extractionData.keyFindings,
          contributions: extractionData.contributions,
          limitations: extractionData.limitations,
          confidence: extractionData.confidence,
          extractionNotes: extractionData.extractionNotes || confScore.reason,
        },
        update: {
          methodology: extractionData.methodology,
          keyFindings: extractionData.keyFindings,
          contributions: extractionData.contributions,
          limitations: extractionData.limitations,
          confidence: extractionData.confidence,
          extractionNotes: extractionData.extractionNotes || confScore.reason,
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

  const handleRankPapers = async () => {
    if (!selectedProject || papers.length === 0) return;

    try {
      setIsRanking(true);
      setActionError(null);
      setRankingProgress("Assembling candidate papers from database...");

      const projectDomain: LitReviewProject = {
        id: selectedProject.id,
        title: selectedProject.title,
        description: selectedProject.description || undefined,
        query: selectedProject.query,
        inclusionCriteria: selectedProject.inclusionCriteria,
        exclusionCriteria: selectedProject.exclusionCriteria,
        status: selectedProject.status as any,
      };

      const paperMetas: PaperMetadata[] = papers.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        abstract: p.abstract,
        publishedDate: p.publishedDate,
        source: p.source as any,
        sourceId: p.sourceId,
        url: p.url,
        pdfUrl: p.pdfUrl || undefined,
        categories: p.categories,
        status: p.status as any,
        rawContent: p.rawContent || undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));

      const apiKey = process.env.OPENROUTER_API_KEY;
      const defaultModel = process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;

      let entries;
      if (apiKey) {
        setRankingProgress(`Ranking papers via OpenRouter (${defaultModel})...`);
        const llm = createOpenRouterClient({ apiKey, defaultModel });
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

  const handleBridgeReviewToBriefing = async () => {
    if (!selectedProject) return;

    try {
      setActionError(null);
      const { createBriefingFromLiteratureReview, buildLiteratureReviewDraft } = await import("@scholarkit/core");

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
      const nextIssue = briefings.length + 1;
      const briefingDraft = createBriefingFromLiteratureReview(projectDomain, draftResult, topPapers, {
        issueNumber: nextIssue,
      });

      await prisma.briefing.create({
        data: {
          title: briefingDraft.title,
          issueNumber: briefingDraft.issueNumber,
          contentType: briefingDraft.contentType,
          status: briefingDraft.status,
          target: briefingDraft.target,
          sections: {
            create: briefingDraft.sections.map((s) => ({
              title: s.title,
              content: s.content,
              order: s.order,
              sectionType: s.sectionType,
              paperReferences: s.paperReferences,
            })),
          },
        },
      });

      await refreshBriefings();
      setActiveTab("briefings");
      setSelectedIndex(0);
    } catch (err) {
      setActionError(`Bridge to briefing failed: ${(err as Error).message}`);
    }
  };

  const handleDirectTransition = async (action: WorkflowAction) => {
    if (!selectedBriefing) return;

    try {
      setActionError(null);
      const { transitionReviewStatus } = await import("@scholarkit/core");
      const nextStatus = transitionReviewStatus(selectedBriefing.status as any, action);

      await prisma.briefing.update({
        where: { id: selectedBriefing.id },
        data: {
          status: nextStatus,
          scheduledAt: nextStatus === "scheduled" ? new Date(Date.now() + 3600000) : selectedBriefing.scheduledAt,
          sentAt: nextStatus === "sent" ? new Date() : selectedBriefing.sentAt,
        },
      });

      await refreshBriefings();
    } catch (err) {
      setActionError(`Transition failed: ${(err as Error).message}`);
    }
  };

  const handleRunSchedulerWorker = async () => {
    try {
      setActionError(null);
      const { evaluateScheduledQueue, formatBriefingForTelegramHtml, chunkTelegramMessage, sendTelegramChunks } = await import("@scholarkit/core");

      const scheduledBriefings = await prisma.briefing.findMany({
        where: { status: "scheduled" },
        include: { sections: { orderBy: { order: "asc" } } },
      });

      const { due } = evaluateScheduledQueue(scheduledBriefings, new Date());
      if (due.length === 0) {
        setActionError("No due scheduled briefings in queue.");
        return;
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const targetChatId = process.env.TELEGRAM_CHAT_ID;

      if (!botToken || botToken.includes("123456789") || !targetChatId) {
        setActionError("Valid TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required in .env to dispatch.");
        return;
      }

      for (const b of due) {
        await prisma.briefing.update({
          where: { id: b.id },
          data: { status: "sending" },
        });

        const html = formatBriefingForTelegramHtml({
          title: b.title,
          issueNumber: b.issueNumber || undefined,
          contentType: b.contentType,
          status: "sending",
          target: b.target,
          sections: b.sections.map((s) => ({
            title: s.title,
            content: s.content,
            order: s.order,
            sectionType: s.sectionType as any,
            paperReferences: s.paperReferences,
          })),
        });

        const chunks = chunkTelegramMessage(html, targetChatId, 4096);
        await sendTelegramChunks(botToken, chunks, 1000);

        await prisma.deliveryLog.create({
          data: {
            briefingId: b.id,
            telegramChatId: targetChatId,
            status: "sent",
            sentAt: new Date(),
          },
        });

        await prisma.briefing.update({
          where: { id: b.id },
          data: { status: "sent", sentAt: new Date() },
        });
      }

      await refreshBriefings();
    } catch (err) {
      setActionError(`Scheduler worker error: ${(err as Error).message}`);
    }
  };

  const isDevMode = Boolean(
    process.argv.includes("--dev") || process.env.SCHOLARKIT_DEV === "1"
  );

  const isAnyModalOpen =
    isIngestModalOpen ||
    isCreateReviewOpen ||
    isDraftModalOpen ||
    isCreateBriefingOpen ||
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
        setActiveTab("briefings");
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
          handleBridgeReviewToBriefing();
        }
      } else if (activeTab === "briefings") {
        if (input === "n" || input === "N") {
          setIsCreateBriefingOpen(true);
        } else if (input === "t" || input === "T") {
          if (selectedBriefing) {
            setIsTransitionOpen(true);
          }
        } else if (input === "p" || input === "P") {
          if (selectedBriefing) {
            setIsTelegramPreviewOpen(true);
          }
        } else if (input === "a" || input === "A") {
          if (selectedBriefing?.status === "in_review") {
            handleDirectTransition("approve");
          }
        } else if (input === "c" || input === "C") {
          if (selectedBriefing?.status === "in_review") {
            handleDirectTransition("request_changes");
          }
        } else if (input === "S") {
          if (selectedBriefing?.status === "approved") {
            handleDirectTransition("schedule");
          }
        } else if (input === "w" || input === "W") {
          handleRunSchedulerWorker();
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
        : "Research Briefings";

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
    { key: "N", label: "To Briefing" },
    { key: "R", label: "Refresh" },
  ];

  const briefingHotkeys = [
    { key: "n", label: "New Issue" },
    { key: "t", label: "Transition" },
    ...(selectedBriefing?.status === "in_review"
      ? [
          { key: "a", label: "Approve" },
          { key: "c", label: "Request Changes" },
        ]
      : []),
    ...(selectedBriefing?.status === "approved" ? [{ key: "S", label: "Schedule" }] : []),
    ...(selectedBriefing?.status === "scheduled" ? [{ key: "w", label: "Dispatch" }] : []),
    { key: "p", label: "Telegram Preview" },
    { key: "R", label: "Refresh" },
  ];

  const customHotkeys =
    activeTab === "papers"
      ? paperHotkeys
      : activeTab === "reviews"
        ? reviewHotkeys
        : briefingHotkeys;

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

      {/* Briefing Modals */}
      <CreateBriefingModal
        isOpen={isCreateBriefingOpen}
        onClose={() => setIsCreateBriefingOpen(false)}
        onSuccess={refreshBriefings}
      />
      <TransitionDialog
        briefing={selectedBriefing}
        isOpen={isTransitionOpen}
        onClose={() => setIsTransitionOpen(false)}
        onSuccess={refreshBriefings}
      />
      <TelegramPreviewModal
        briefing={selectedBriefing}
        isOpen={isTelegramPreviewOpen}
        onClose={() => setIsTelegramPreviewOpen(false)}
        onSuccess={refreshBriefings}
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
                  : `Briefings (${briefings.length})`
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
              <BriefingListView
                briefings={briefings}
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
                  : "Briefing Details & Workflow"
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
              <BriefingDetailView briefing={selectedBriefing} />
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
