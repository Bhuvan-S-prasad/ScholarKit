import { PaperMetadata, PaperExtraction, PaperExtractionSchema } from "../schemas.js";
import { LLMClient } from "./llm-client.js";

/**
 * Creates a deterministic stub extraction for testing and local bootstrapping without LLM calls.
 */
export function createStubExtraction(paper: PaperMetadata): PaperExtraction {
  return {
    paperId: paper.id || paper.sourceId,
    methodology: {
      approach: `Automated analytical evaluation of ${paper.title}`,
      datasetInfo: "Standard benchmark datasets referenced in paper abstract",
      toolsOrFrameworks: ["Python", "PyTorch"],
      experimentalSetup: "Simulated execution environment",
    },
    keyFindings: [
      `Primary finding derived from abstract: ${paper.abstract.slice(0, 100)}...`,
      "Demonstrated performance improvements across primary benchmarks",
    ],
    contributions: [
      "Novel architecture/framework proposed for domain application",
      "Empirical validation across varied benchmark baselines",
    ],
    limitations: [
      "Requires empirical evaluation under non-standard domain distributions",
      "Computational overhead during peak batch workloads",
    ],
    confidence: 0.9,
    extractionNotes: "Stub extraction generated without live LLM invocation.",
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Evaluates extraction confidence score and determines if human review is required.
 * Fulfills rule: "LLM extraction confidence is not decoration. Low confidence should flag the extraction."
 */
export function evaluateExtractionConfidence(
  extraction: PaperExtraction,
  threshold = 0.75
): { isReliable: boolean; flagForHumanReview: boolean; reason?: string } {
  if (extraction.confidence < threshold) {
    return {
      isReliable: false,
      flagForHumanReview: true,
      reason: `Confidence score (${(extraction.confidence * 100).toFixed(1)}%) is below the reliability threshold (${(threshold * 100).toFixed(1)}%). Human verification required before inclusion in digests or literature reviews.`,
    };
  }
  return {
    isReliable: true,
    flagForHumanReview: false,
  };
}

/**
 * Executes LLM-backed structured extraction on parsed paper text.
 */
export async function extractPaperData(
  paper: PaperMetadata,
  rawContent: string,
  llm: LLMClient
): Promise<PaperExtraction> {
  const systemPrompt = `You are an expert scientific researcher and research paper analyst.
Extract structured methodology, findings, contributions, limitations, and an honest confidence score (0.0 to 1.0) from the provided scientific paper.
Respond with structured JSON strictly conforming to the requested schema.`;

  const userPrompt = `Paper Title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Source ID: ${paper.sourceId}

Abstract:
${paper.abstract}

Paper Text Content:
${rawContent.slice(0, 24000)}

Please extract the methodology, key findings, contributions, limitations, and confidence score.`;

  const extraction = await llm.generateStructured<PaperExtraction>({
    systemPrompt,
    userPrompt,
    schema: PaperExtractionSchema,
    schemaName: "PaperExtraction",
    temperature: 0.1,
  });

  return {
    ...extraction,
    paperId: paper.id || paper.sourceId,
    extractedAt: new Date().toISOString(),
  };
}
