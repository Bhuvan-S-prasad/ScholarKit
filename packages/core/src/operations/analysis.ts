import { PaperExtraction, PaperAnalysis, PaperAnalysisSchema } from "../schemas.js";
import { LLMClient } from "./llm-client.js";

/**
 * Performs comparative analysis across multiple extracted papers using an injected LLM client.
 */
export async function comparePapers(
  extractions: PaperExtraction[],
  llm: LLMClient
): Promise<PaperAnalysis> {
  if (extractions.length < 2) {
    throw new Error("Comparative analysis requires at least two paper extractions.");
  }

  const paperSummaries = extractions
    .map((ext, idx) => {
      return `--- Paper ${idx + 1} (ID: ${ext.paperId || `Paper-${idx + 1}`}) ---
Methodology: ${ext.methodology.approach}
Key Findings: ${ext.keyFindings.join("; ")}
Contributions: ${ext.contributions.join("; ")}
Limitations: ${ext.limitations.join("; ")}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a principal research scientist specializing in meta-analyses and literature synthesis.
Compare the provided papers across consistent thematic topics, synthesize their differences, identify common limitations, and pinpoint open research gaps.`;

  const userPrompt = `Compare the following papers:

${paperSummaries}

Provide a comparative matrix, common limitations, research gaps, and practical implications.`;

  const analysis = await llm.generateStructured<PaperAnalysis>({
    systemPrompt,
    userPrompt,
    schema: PaperAnalysisSchema,
    schemaName: "PaperAnalysis",
    temperature: 0.2,
  });

  return {
    ...analysis,
    paperIds: extractions.map((e) => e.paperId || "unknown"),
    generatedAt: new Date().toISOString(),
  };
}
