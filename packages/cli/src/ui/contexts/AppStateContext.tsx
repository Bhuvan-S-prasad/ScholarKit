import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { prisma, Paper, PaperExtraction, LitReviewProject, LitReviewEntry, Briefing, BriefingSection } from "@scholarkit/db";

export type PaperWithExtraction = Paper & { extraction: PaperExtraction | null };
export type ProjectWithEntries = LitReviewProject & { entries: (LitReviewEntry & { paper: Paper })[] };
export type BriefingWithSections = Briefing & { sections: BriefingSection[] };
export type NewsletterWithSections = BriefingWithSections;

export interface AppStateContextValue {
  papers: PaperWithExtraction[];
  projects: ProjectWithEntries[];
  briefings: BriefingWithSections[];
  newsletters: BriefingWithSections[]; // alias
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  refreshPapers: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshBriefings: () => Promise<void>;
  refreshNewsletters: () => Promise<void>; // alias
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [papers, setPapers] = useState<PaperWithExtraction[]>([]);
  const [projects, setProjects] = useState<ProjectWithEntries[]>([]);
  const [briefings, setBriefings] = useState<BriefingWithSections[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPapers = useCallback(async () => {
    try {
      const data = await prisma.paper.findMany({
        orderBy: { createdAt: "desc" },
        include: { extraction: true },
      });
      setPapers(data);
    } catch (err) {
      setError(`Failed to load papers: ${(err as Error).message}`);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const data = await prisma.litReviewProject.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          entries: {
            include: { paper: true },
          },
        },
      });
      setProjects(data as ProjectWithEntries[]);
    } catch (err) {
      setError(`Failed to load review projects: ${(err as Error).message}`);
    }
  }, []);

  const refreshBriefings = useCallback(async () => {
    try {
      const data = await prisma.briefing.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          sections: {
            orderBy: { order: "asc" },
          },
        },
      });
      setBriefings(data);
    } catch (err) {
      setError(`Failed to load briefings: ${(err as Error).message}`);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshPapers(), refreshProjects(), refreshBriefings()]);
    } finally {
      setLoading(false);
    }
  }, [refreshPapers, refreshProjects, refreshBriefings]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <AppStateContext.Provider
      value={{
        papers,
        projects,
        briefings,
        newsletters: briefings,
        loading,
        error,
        refreshAll,
        refreshPapers,
        refreshProjects,
        refreshBriefings,
        refreshNewsletters: refreshBriefings,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = (): AppStateContextValue => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
};
