import { z } from "zod";
import {
  searchArxivPapers,
  classifyAndRankPapers,
  buildLiteratureReviewDraft,
  createBriefingFromLiteratureReview,
  LitReviewProject,
  PaperMetadata,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { McpToolDefinition } from "../types.js";
import { getLlmClient } from "../utils/llm.js";

/**
 * 1. Create a literature review project.
 */
export const createReviewProjectTool: McpToolDefinition = {
  name: "create_review_project",
  description:
    "Initialize a new Literature Review Project with research topic query, inclusion criteria, and exclusion criteria.",
  parameters: z.object({
    title: z.string().describe("Descriptive title of the literature review project"),
    query: z.string().describe("Research topic search query (e.g., 'Speculative Decoding LLM Inference')"),
    description: z.string().optional().describe("Optional project scope summary"),
    inclusionCriteria: z
      .array(z.string())
      .optional()
      .default([])
      .describe("List of inclusion criteria for candidate papers"),
    exclusionCriteria: z
      .array(z.string())
      .optional()
      .default([])
      .describe("List of exclusion criteria for filtering out non-relevant papers"),
  }),
  execute: async ({ title, query, description, inclusionCriteria = [], exclusionCriteria = [] }) => {
    const project = await prisma.litReviewProject.create({
      data: {
        title,
        query,
        description,
        inclusionCriteria,
        exclusionCriteria,
        status: "active",
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Created literature review project "${project.title}"`,
              projectId: project.id,
              title: project.title,
              query: project.query,
              inclusionCriteria: project.inclusionCriteria,
              exclusionCriteria: project.exclusionCriteria,
              status: project.status,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 2. Search arXiv, deduplicate, and auto-ingest candidate papers for a project.
 */
export const searchArxivPapersTool: McpToolDefinition = {
  name: "search_arxiv_papers",
  description:
    "Query arXiv Atom API for research papers matching a query or project, deduplicate against the Neon database, and persist new papers.",
  parameters: z.object({
    query: z.string().describe("Search query string (e.g., 'Agentic Workflows LLM')"),
    maxResults: z.number().optional().default(6).describe("Maximum number of arXiv papers to search (default: 6)"),
    projectId: z
      .string()
      .optional()
      .describe("Optional project UUID to automatically evaluate and rank newly discovered papers"),
    model: z.string().optional().describe("Optional LLM model override for ranking if projectId is passed"),
  }),
  execute: async ({ query, maxResults = 6, projectId, model }) => {
    const searchResults = await searchArxivPapers(query, { maxResults });

    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ message: "No papers found on arXiv for this query.", totalFound: 0 }),
          },
        ],
      };
    }

    const existing = await prisma.paper.findMany({
      where: { sourceId: { in: searchResults.map((p) => p.sourceId) } },
    });
    const existingIds = new Set(existing.map((p) => p.sourceId));
    const newPapers = searchResults.filter((p) => !existingIds.has(p.sourceId));

    const savedNewPapers = [];
    for (const p of newPapers) {
      const saved = await prisma.paper.create({
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
      savedNewPapers.push(saved);
    }

    let rankingSummary = null;
    if (projectId) {
      const project = await prisma.litReviewProject.findUnique({
        where: { id: projectId },
      });

      if (project) {
        const allCandidates = await prisma.paper.findMany({
          take: 20,
          orderBy: { createdAt: "desc" },
        });

        const projectDomain: LitReviewProject = {
          id: project.id,
          title: project.title,
          description: project.description || undefined,
          query: project.query,
          inclusionCriteria: project.inclusionCriteria,
          exclusionCriteria: project.exclusionCriteria,
          status: project.status as any,
        };

        const paperMetas: PaperMetadata[] = allCandidates.map((p) => ({
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

        const llm = getLlmClient(model);
        const entries = await classifyAndRankPapers(projectDomain, paperMetas, llm);

        for (const entry of entries) {
          await prisma.litReviewEntry.upsert({
            where: {
              projectId_paperId: {
                projectId: project.id,
                paperId: entry.paperId,
              },
            },
            create: {
              projectId: project.id,
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

        rankingSummary = {
          rankedCount: entries.length,
          topRanked: entries.slice(0, 3),
        };
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              totalFound: searchResults.length,
              newIngestedCount: savedNewPapers.length,
              existingCount: existing.length,
              newPapers: savedNewPapers.map((p) => ({
                id: p.id,
                sourceId: p.sourceId,
                title: p.title,
                authors: p.authors,
              })),
              rankingSummary,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 3. Classify and rank papers against project criteria.
 */
export const rankPapersTool: McpToolDefinition = {
  name: "rank_papers",
  description:
    "Classify candidate papers into 4 tiers (highly_relevant, relevant, background, irrelevant) and score against project criteria using LLM.",
  parameters: z.object({
    projectId: z.string().describe("UUID of the literature review project"),
    paperIds: z
      .array(z.string())
      .optional()
      .describe("Optional specific subset of paper UUIDs to rank. If omitted, evaluates all available papers in database."),
    model: z.string().optional().describe("Optional LLM model override"),
  }),
  execute: async ({ projectId, paperIds, model }) => {
    const project = await prisma.litReviewProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Literature review project not found with ID: ${projectId}`);
    }

    const where = paperIds && paperIds.length > 0 ? { id: { in: paperIds } } : {};
    const papers = await prisma.paper.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (papers.length === 0) {
      throw new Error("No candidate papers found in database to evaluate.");
    }

    const projectDomain: LitReviewProject = {
      id: project.id,
      title: project.title,
      description: project.description || undefined,
      query: project.query,
      inclusionCriteria: project.inclusionCriteria,
      exclusionCriteria: project.exclusionCriteria,
      status: project.status as any,
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

    const llm = getLlmClient(model);
    const rankedEntries = await classifyAndRankPapers(projectDomain, paperMetas, llm);

    const savedEntries = [];
    for (const entry of rankedEntries) {
      const saved = await prisma.litReviewEntry.upsert({
        where: {
          projectId_paperId: {
            projectId: project.id,
            paperId: entry.paperId,
          },
        },
        create: {
          projectId: project.id,
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
      savedEntries.push(saved);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              projectId: project.id,
              projectTitle: project.title,
              evaluatedCount: savedEntries.length,
              rankings: savedEntries.map((e) => ({
                paperId: e.paperId,
                relevanceScore: e.relevanceScore,
                classification: e.classification,
                reasonForScore: e.reasonForScore,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 4. Generate structured literature review draft.
 */
export const draftLiteratureReviewTool: McpToolDefinition = {
  name: "draft_literature_review",
  description:
    "Synthesize a structured literature review draft (executive summary, thematic synthesis with citations, research gaps, conclusion) from ranked papers.",
  parameters: z.object({
    projectId: z.string().describe("UUID of the literature review project"),
    model: z.string().optional().describe("Optional LLM model override"),
  }),
  execute: async ({ projectId, model }) => {
    const project = await prisma.litReviewProject.findUnique({
      where: { id: projectId },
      include: {
        entries: {
          include: { paper: true },
          orderBy: { relevanceScore: "desc" },
        },
      },
    });

    if (!project) {
      throw new Error(`Literature review project not found with ID: ${projectId}`);
    }

    if (project.entries.length === 0) {
      throw new Error("Project has no ranked paper entries. Run 'rank_papers' or 'search_arxiv_papers' first.");
    }

    const projectDomain: LitReviewProject = {
      id: project.id,
      title: project.title,
      description: project.description || undefined,
      query: project.query,
      inclusionCriteria: project.inclusionCriteria,
      exclusionCriteria: project.exclusionCriteria,
      status: project.status as any,
    };

    const entriesWithPapers = project.entries.map((e) => ({
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

    const llm = getLlmClient(model);
    const draft = await buildLiteratureReviewDraft(projectDomain, entriesWithPapers, llm);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              projectId: project.id,
              title: draft.title,
              abstractOrExecutiveSummary: draft.abstractOrExecutiveSummary,
              sections: draft.sections,
              researchGapsIdentified: draft.researchGapsIdentified,
              conclusion: draft.conclusion,
              generatedAt: draft.generatedAt,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 5. Bridge synthesized literature review directly into a structured research briefing issue draft.
 */
export const bridgeReviewToBriefingTool: McpToolDefinition = {
  name: "bridge_review_to_briefing",
  description:
    "Convert a synthesized literature review project into a multi-section Research Briefing issue draft ready for editorial review.",
  parameters: z.object({
    projectId: z.string().describe("UUID of the literature review project"),
    model: z.string().optional().describe("Optional LLM model override"),
  }),
  execute: async ({ projectId, model }) => {
    const project = await prisma.litReviewProject.findUnique({
      where: { id: projectId },
      include: {
        entries: {
          include: { paper: true },
          orderBy: { relevanceScore: "desc" },
        },
      },
    });

    if (!project) {
      throw new Error(`Literature review project not found with ID: ${projectId}`);
    }

    if (project.entries.length === 0) {
      throw new Error("Project has no ranked paper entries. Rank papers first.");
    }

    const projectDomain: LitReviewProject = {
      id: project.id,
      title: project.title,
      description: project.description || undefined,
      query: project.query,
      inclusionCriteria: project.inclusionCriteria,
      exclusionCriteria: project.exclusionCriteria,
      status: project.status as any,
    };

    const entriesWithPapers = project.entries.map((e) => ({
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

    const llm = getLlmClient(model);
    const draft = await buildLiteratureReviewDraft(projectDomain, entriesWithPapers, llm);
    const topPapers = entriesWithPapers.map((e) => e.paper as PaperMetadata);

    const count = await prisma.briefing.count();
    const issueNumber = count + 1;

    const briefingDraft = createBriefingFromLiteratureReview(projectDomain, draft, topPapers, {
      issueNumber,
    });

    const savedBriefing = await prisma.briefing.create({
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
      include: { sections: { orderBy: { order: "asc" } } },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Successfully bridged review to Briefing issue #${savedBriefing.issueNumber}`,
              briefingId: savedBriefing.id,
              issueNumber: savedBriefing.issueNumber,
              title: savedBriefing.title,
              status: savedBriefing.status,
              sectionsCount: savedBriefing.sections.length,
              sections: savedBriefing.sections.map((s) => ({
                order: s.order,
                title: s.title,
                sectionType: s.sectionType,
                paperReferences: s.paperReferences,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 6. List all literature review projects.
 */
export const listReviewProjectsTool: McpToolDefinition = {
  name: "list_review_projects",
  description: "List literature review projects with their entries, search queries, and status.",
  parameters: z.object({
    status: z.enum(["active", "completed", "archived"]).optional().describe("Filter projects by status"),
  }),
  execute: async ({ status }) => {
    const where = status ? { status } : {};
    const projects = await prisma.litReviewProject.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        entries: {
          select: {
            id: true,
            relevanceScore: true,
            classification: true,
          },
        },
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            projects.map((p) => ({
              id: p.id,
              title: p.title,
              query: p.query,
              status: p.status,
              entriesCount: p.entries.length,
              highlyRelevantCount: p.entries.filter((e) => e.classification === "highly_relevant").length,
              createdAt: p.createdAt,
            })),
            null,
            2
          ),
        },
      ],
    };
  },
};

export const reviewTools: McpToolDefinition[] = [
  createReviewProjectTool,
  searchArxivPapersTool,
  rankPapersTool,
  draftLiteratureReviewTool,
  bridgeReviewToBriefingTool,
  listReviewProjectsTool,
];
