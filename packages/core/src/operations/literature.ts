import { z } from "zod";
import {
  PaperMetadata,
  LitReviewProject,
  LitReviewEntry,
  LitReviewEntrySchema,
  LiteratureReviewDraft,
  LiteratureReviewDraftSchema,
  LitClassification,
} from "../schemas.js";
import { LLMClient } from "./llm-client.js";

/**
 * Normalizes title string for duplicate detection (lowercase, alphanumeric only).
 */
export function normalizeTitleForDeduplication(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Pure deduplication of paper lists based on sourceId and normalized title.
 */
export function deduplicatePapers(papers: PaperMetadata[]): PaperMetadata[] {
  const seenSourceIds = new Set<string>();
  const seenTitles = new Set<string>();
  const unique: PaperMetadata[] = [];

  for (const paper of papers) {
    const normTitle = normalizeTitleForDeduplication(paper.title);
    if (paper.sourceId && seenSourceIds.has(paper.sourceId)) {
      continue;
    }
    if (seenTitles.has(normTitle)) {
      continue;
    }

    if (paper.sourceId) seenSourceIds.add(paper.sourceId);
    if (normTitle) seenTitles.add(normTitle);
    unique.push(paper);
  }

  return unique;
}

const ClassificationListSchema = z.object({
  evaluations: z.array(
    z.object({
      paperId: z.string(),
      relevanceScore: z.number().min(0).max(1),
      classification: z.enum(["highly_relevant", "relevant", "background", "irrelevant"]),
      reasonForScore: z.string(),
    })
  ),
});

/**
 * Classifies and ranks paper relevance against a project's research criteria.
 */
export async function classifyAndRankPapers(
  project: LitReviewProject,
  papers: PaperMetadata[],
  llm: LLMClient
): Promise<LitReviewEntry[]> {
  if (papers.length === 0) return [];

  const paperDescriptions = papers
    .map(
      (p, i) =>
        `[Paper ${i + 1}] ID: ${p.id || p.sourceId}\nTitle: ${p.title}\nAbstract: ${p.abstract}`
    )
    .join("\n\n");

  const systemPrompt = `You are a scientific literature review evaluator.
Classify papers based on relevance to the research project, assign a relevance score between 0.0 and 1.0, and provide clear justification.`;

  const userPrompt = `Research Project: ${project.title}
Query: ${project.query}
Inclusion Criteria: ${project.inclusionCriteria.join("; ") || "None specified"}
Exclusion Criteria: ${project.exclusionCriteria.join("; ") || "None specified"}

Papers to Evaluate:
${paperDescriptions}`;

  const result = await llm.generateStructured<z.infer<typeof ClassificationListSchema>>({
    systemPrompt,
    userPrompt,
    schema: ClassificationListSchema,
    schemaName: "PaperClassificationList",
    temperature: 0.1,
  });

  return result.evaluations.map((item) =>
    LitReviewEntrySchema.parse({
      projectId: project.id || "current-project",
      paperId: item.paperId,
      relevanceScore: item.relevanceScore,
      classification: item.classification as LitClassification,
      reasonForScore: item.reasonForScore,
      createdAt: new Date().toISOString(),
    })
  );
}

/**
 * Builds a structured Literature Review draft synthesizing relevant papers.
 */
export async function buildLiteratureReviewDraft(
  project: LitReviewProject,
  entriesWithPapers: Array<{ entry: LitReviewEntry; paper: PaperMetadata }>,
  llm: LLMClient
): Promise<LiteratureReviewDraft> {
  const relevantPapers = entriesWithPapers.filter(
    (e) => e.entry.classification === "highly_relevant" || e.entry.classification === "relevant"
  );

  const paperSummaries = relevantPapers
    .map(
      (e) =>
        `Title: ${e.paper.title}\nAuthors: ${e.paper.authors.join(", ")}\nClassification: ${e.entry.classification}\nAbstract: ${e.paper.abstract}`
    )
    .join("\n\n");

  const systemPrompt = `You are an academic researcher writing a comprehensive literature review.
Synthesize the provided papers into structured thematic sections with clear citations, research gap analysis, and a definitive conclusion.`;

  const userPrompt = `Literature Review Topic: ${project.title}
Scope / Query: ${project.query}

Included Papers:
${paperSummaries}

Draft a comprehensive literature review with structured sections, citing the relevant papers.`;

  return llm.generateStructured<LiteratureReviewDraft>({
    systemPrompt,
    userPrompt,
    schema: LiteratureReviewDraftSchema,
    schemaName: "LiteratureReviewDraft",
    temperature: 0.2,
  });
}
