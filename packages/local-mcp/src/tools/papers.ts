import { z } from "zod";
import {
  fetchArxivMetadata,
  extractPaperData,
  createStubExtraction,
  evaluateExtractionConfidence,
  comparePapers,
  PaperExtraction,
  PaperMetadata,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { McpToolDefinition } from "../types.js";
import { getLlmClient } from "../utils/llm.js";

/**
 * 1. Ingest paper from arXiv ID or URL into Neon DB.
 */
export const ingestPaperTool: McpToolDefinition = {
  name: "ingest_paper",
  description:
    "Fetch academic research paper metadata directly from arXiv by arXiv ID (e.g. '2312.12456') or URL and persist it in the Neon database.",
  parameters: z.object({
    arxivIdOrUrl: z
      .string()
      .describe("arXiv identifier (e.g., '2312.12456', 'arXiv:2312.12456v2') or arXiv abstract/PDF URL"),
  }),
  execute: async ({ arxivIdOrUrl }) => {
    const paperMeta = await fetchArxivMetadata(arxivIdOrUrl);

    const existing = await prisma.paper.findUnique({
      where: { sourceId: paperMeta.sourceId },
    });

    let saved;
    if (existing) {
      saved = await prisma.paper.update({
        where: { id: existing.id },
        data: {
          title: paperMeta.title,
          authors: paperMeta.authors,
          abstract: paperMeta.abstract,
          publishedDate: paperMeta.publishedDate,
          url: paperMeta.url,
          pdfUrl: paperMeta.pdfUrl,
          categories: paperMeta.categories,
        },
      });
    } else {
      saved = await prisma.paper.create({
        data: {
          title: paperMeta.title,
          authors: paperMeta.authors,
          abstract: paperMeta.abstract,
          publishedDate: paperMeta.publishedDate,
          source: paperMeta.source,
          sourceId: paperMeta.sourceId,
          url: paperMeta.url,
          pdfUrl: paperMeta.pdfUrl,
          categories: paperMeta.categories,
          status: paperMeta.status,
        },
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Successfully ingested paper "${saved.title}"`,
              paperId: saved.id,
              sourceId: saved.sourceId,
              title: saved.title,
              authors: saved.authors,
              publishedDate: saved.publishedDate,
              categories: saved.categories,
              status: saved.status,
              url: saved.url,
              pdfUrl: saved.pdfUrl,
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
 * 2. Extract structured methodology, findings, contributions, and limitations with confidence scoring.
 */
export const extractPaperTool: McpToolDefinition = {
  name: "extract_paper",
  description:
    "Run LLM-backed structured extraction on an ingested paper to extract methodology, key findings, contributions, limitations, and confidence score.",
  parameters: z.object({
    paperId: z.string().describe("UUID of the paper in the ScholarKit database"),
    useStub: z
      .boolean()
      .optional()
      .describe("If true, uses deterministic stub extraction instead of calling the live LLM"),
    model: z.string().optional().describe("Optional LLM model override (e.g. 'openai/gpt-4o-mini')"),
  }),
  execute: async ({ paperId, useStub = false, model }) => {
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
    });

    if (!paper) {
      throw new Error(`Paper not found with ID: ${paperId}`);
    }

    const domainPaper: PaperMetadata = {
      id: paper.id,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      publishedDate: paper.publishedDate,
      source: paper.source as any,
      sourceId: paper.sourceId,
      url: paper.url,
      pdfUrl: paper.pdfUrl || undefined,
      categories: paper.categories,
      status: paper.status as any,
      rawContent: paper.rawContent || undefined,
      createdAt: paper.createdAt.toISOString(),
      updatedAt: paper.updatedAt.toISOString(),
    };

    let extractionData;
    if (useStub) {
      extractionData = createStubExtraction(domainPaper);
    } else {
      const llm = getLlmClient(model);
      const content = paper.rawContent || paper.abstract;
      extractionData = await extractPaperData(domainPaper, content, llm);
    }

    const confScore = evaluateExtractionConfidence(extractionData);

    const savedExtraction = await prisma.paperExtraction.upsert({
      where: { paperId: paper.id },
      create: {
        paperId: paper.id,
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
      where: { id: paper.id },
      data: { status: "extracted" },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              paperId: paper.id,
              title: paper.title,
              confidence: savedExtraction.confidence,
              isReliable: confScore.isReliable,
              flagForHumanReview: confScore.flagForHumanReview,
              methodology: savedExtraction.methodology,
              keyFindings: savedExtraction.keyFindings,
              contributions: savedExtraction.contributions,
              limitations: savedExtraction.limitations,
              extractionNotes: savedExtraction.extractionNotes,
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
 * 3. Comparative analysis and research gap identification across multiple papers.
 */
export const analyzePapersTool: McpToolDefinition = {
  name: "analyze_papers",
  description:
    "Perform comparative matrix analysis, common limitations, and research gap identification across 2 or more ingested papers.",
  parameters: z.object({
    paperIds: z
      .array(z.string())
      .min(2)
      .describe("List of paper UUIDs (minimum 2) to analyze and compare"),
    model: z.string().optional().describe("Optional LLM model override"),
  }),
  execute: async ({ paperIds, model }) => {
    const papers = await prisma.paper.findMany({
      where: { id: { in: paperIds } },
      include: { extraction: true },
    });

    if (papers.length < 2) {
      throw new Error(`Found only ${papers.length} paper(s). Comparative analysis requires at least 2 valid papers.`);
    }

    const extractions: PaperExtraction[] = papers.map((p) => {
      if (p.extraction) {
        return {
          paperId: p.id,
          methodology: p.extraction.methodology as any,
          keyFindings: p.extraction.keyFindings,
          contributions: p.extraction.contributions,
          limitations: p.extraction.limitations,
          confidence: p.extraction.confidence,
          extractionNotes: p.extraction.extractionNotes || undefined,
        };
      }

      // If paper was not extracted yet, construct fallback structured extraction from abstract
      const domainPaper: PaperMetadata = {
        id: p.id,
        title: p.title,
        authors: p.authors,
        abstract: p.abstract,
        publishedDate: p.publishedDate,
        source: p.source as any,
        sourceId: p.sourceId,
        url: p.url,
        categories: p.categories,
        status: p.status as any,
      };
      return createStubExtraction(domainPaper);
    });

    const llm = getLlmClient(model);
    const analysis = await comparePapers(extractions, llm);

    for (const p of papers) {
      if (p.status !== "analyzed") {
        await prisma.paper.update({
          where: { id: p.id },
          data: { status: "analyzed" },
        });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              comparedPapersCount: papers.length,
              paperIds: analysis.paperIds,
              comparisonMatrix: analysis.comparisonMatrix,
              commonLimitations: analysis.commonLimitations,
              researchGaps: analysis.researchGaps,
              practicalImplications: analysis.practicalImplications,
              generatedAt: analysis.generatedAt,
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
 * 4. Browse and filter papers from database.
 */
export const listPapersTool: McpToolDefinition = {
  name: "list_papers",
  description: "List ingested research papers from the ScholarKit database with filtering and pagination.",
  parameters: z.object({
    status: z
      .enum(["ingested", "extracting", "extracted", "analyzed", "archived"])
      .optional()
      .describe("Filter papers by processing status"),
    search: z.string().optional().describe("Search query matching paper title or abstract"),
    limit: z.number().optional().default(20).describe("Maximum number of papers to return (default: 20)"),
  }),
  execute: async ({ status, search, limit = 20 }) => {
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { abstract: { contains: search, mode: "insensitive" } },
      ];
    }

    const papers = await prisma.paper.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { extraction: true },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            papers.map((p) => ({
              id: p.id,
              sourceId: p.sourceId,
              title: p.title,
              authors: p.authors,
              publishedDate: p.publishedDate,
              categories: p.categories,
              status: p.status,
              hasExtraction: Boolean(p.extraction),
              confidence: p.extraction?.confidence,
            })),
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 5. Get full paper details by ID.
 */
export const getPaperTool: McpToolDefinition = {
  name: "get_paper",
  description: "Get full paper metadata, abstract, and structured extraction record by Paper ID or arXiv ID.",
  parameters: z.object({
    paperIdOrSourceId: z.string().describe("Paper UUID or arXiv ID (e.g. '2312.12456')"),
  }),
  execute: async ({ paperIdOrSourceId }) => {
    const paper = await prisma.paper.findFirst({
      where: {
        OR: [{ id: paperIdOrSourceId }, { sourceId: paperIdOrSourceId }],
      },
      include: { extraction: true },
    });

    if (!paper) {
      throw new Error(`Paper not found matching identifier: ${paperIdOrSourceId}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(paper, null, 2),
        },
      ],
    };
  },
};

export const paperTools: McpToolDefinition[] = [
  ingestPaperTool,
  extractPaperTool,
  analyzePapersTool,
  listPapersTool,
  getPaperTool,
];
