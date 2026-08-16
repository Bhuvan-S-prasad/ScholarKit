import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { prisma, Paper, PaperExtraction, LitReviewProject, LitReviewEntry, Newsletter, NewsletterSection } from "@scholarkit/db";

export type PaperWithExtraction = Paper & { extraction: PaperExtraction | null };
export type ProjectWithEntries = LitReviewProject & { entries: (LitReviewEntry & { paper: Paper })[] };
export type NewsletterWithSections = Newsletter & { sections: NewsletterSection[] };

export interface AppStateContextValue {
  papers: PaperWithExtraction[];
  projects: ProjectWithEntries[];
  newsletters: NewsletterWithSections[];
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  refreshPapers: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshNewsletters: () => Promise<void>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [papers, setPapers] = useState<PaperWithExtraction[]>([]);
  const [projects, setProjects] = useState<ProjectWithEntries[]>([]);
  const [newsletters, setNewsletters] = useState<NewsletterWithSections[]>([]);
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

  const refreshNewsletters = useCallback(async () => {
    try {
      const data = await prisma.newsletter.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          sections: {
            orderBy: { order: "asc" },
          },
        },
      });
      setNewsletters(data);
    } catch (err) {
      setError(`Failed to load newsletters: ${(err as Error).message}`);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshPapers(), refreshProjects(), refreshNewsletters()]);
    } finally {
      setLoading(false);
    }
  }, [refreshPapers, refreshProjects, refreshNewsletters]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <AppStateContext.Provider
      value={{
        papers,
        projects,
        newsletters,
        loading,
        error,
        refreshAll,
        refreshPapers,
        refreshProjects,
        refreshNewsletters,
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
