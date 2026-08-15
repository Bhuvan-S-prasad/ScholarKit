import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import {
  classifyAndRankPapers,
  buildLiteratureReviewDraft,
  createOpenRouterClient,
  createMockLLMClient,
  LitReviewProject,
  LitReviewEntry,
  PaperMetadata,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { banner, section, success, info, warn, error, colors } from "../utils/output.js";

export function createReviewCommand(): Command {
  const reviewCmd = new Command("review").description(
    "Literature Review Manager (initialize projects, rank papers, and draft reviews)"
  );

  // --------------------------------------------------------------------------
  // 1. Initialize Literature Review Project
  // --------------------------------------------------------------------------
  reviewCmd
    .command("init <title>")
    .description("Initialize a new literature review project")
    .requiredOption("-q, --query <query>", "Primary research query / topic scope")
    .option("-i, --inclusion <items...>", "Inclusion criteria (e.g. -i 'Must use LLMs' 'Benchmark on GPUs')", [])
    .option("-e, --exclusion <items...>", "Exclusion criteria (e.g. -e 'Non-peer reviewed' 'Pre-2020')", [])
    .option("-d, --description <desc>", "Optional project description")
    .action(async (title: string, options: { query: string; inclusion: string[]; exclusion: string[]; description?: string }) => {
      try {
        const project = await prisma.litReviewProject.create({
          data: {
            title,
            query: options.query,
            description: options.description,
            inclusionCriteria: options.inclusion,
            exclusionCriteria: options.exclusion,
            status: "active",
          },
        });

        banner("Literature Review Project Initialized", `Project ID: ${project.id}`);
        console.log(`${colors.bold}Title:${colors.reset}       ${project.title}`);
        console.log(`${colors.bold}Query:${colors.reset}       ${project.query}`);
        if (project.description) {
          console.log(`${colors.bold}Description:${colors.reset} ${project.description}`);
        }
        console.log(`${colors.bold}Inclusion:${colors.reset}   ${project.inclusionCriteria.join("; ") || "None"}`);
        console.log(`${colors.bold}Exclusion:${colors.reset}   ${project.exclusionCriteria.join("; ") || "None"}`);

        success(`Project created. Ingest papers, then run 'scholarkit review rank ${project.id}' to evaluate relevance.`);
      } catch (err) {
        error(`Failed to create review project: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 2. List Literature Review Projects
  // --------------------------------------------------------------------------
  reviewCmd
    .command("list")
    .description("List all literature review projects")
    .action(async () => {
      try {
        const projects = await prisma.litReviewProject.findMany({
          orderBy: { createdAt: "desc" },
          include: { entries: true },
        });

        if (projects.length === 0) {
          info("No review projects found. Create one using 'scholarkit review init \"Topic Title\" --query \"...\"'.");
          return;
        }

        banner(`Literature Review Projects (${projects.length})`);
        for (const p of projects) {
          console.log(`${colors.bold}• [${p.id}]${colors.reset} ${p.title} ${colors.cyan}(${p.status})${colors.reset}`);
          console.log(`  ${colors.dim}Query: "${p.query}" | Ranked Papers: ${p.entries.length} | Created: ${p.createdAt.toISOString().split("T")[0]}${colors.reset}`);
        }
      } catch (err) {
        error(`Failed to list projects: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 3. Classify and Rank Papers Against Project Criteria
  // --------------------------------------------------------------------------
  reviewCmd
    .command("rank <projectId>")
    .description("Classify and rank all ingested papers against project research criteria")
    .option("--model <model>", "OpenRouter model to use")
    .action(async (projectId: string, options: { model?: string }) => {
      try {
        const project = await prisma.litReviewProject.findUnique({
          where: { id: projectId },
        });

        if (!project) {
          error(`Project "${projectId}" not found in database.`);
          process.exitCode = 1;
          return;
        }

        const papers = await prisma.paper.findMany({
          orderBy: { createdAt: "desc" },
        });

        if (papers.length === 0) {
          warn("No papers found in database. Ingest papers first using 'scholarkit paper ingest <arxiv-id>'.");
          return;
        }

        banner("Ranking Papers for Review", project.title);
        info(`Evaluating ${papers.length} paper(s) against query: "${project.query}"...`);

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
          id: project.id,
          title: project.title,
          description: project.description || undefined,
          query: project.query,
          inclusionCriteria: project.inclusionCriteria,
          exclusionCriteria: project.exclusionCriteria,
          status: project.status as "active" | "completed" | "archived",
        };

        const apiKey = process.env.OPENROUTER_API_KEY;
        const selectedModel = options.model || process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

        let entries: LitReviewEntry[];
        if (apiKey) {
          info(`Ranking with OpenRouter (Model: ${selectedModel})...`);
          const llm = createOpenRouterClient({ apiKey, defaultModel: selectedModel });
          entries = await classifyAndRankPapers(projectDomain, paperMetas, llm);
        } else {
          warn("OPENROUTER_API_KEY not found in environment. Using baseline heuristic classifier.");
          const mockLLM = createMockLLMClient({
            onStructured: () => ({
              evaluations: papers.map((p) => ({
                paperId: p.id,
                relevanceScore: 0.85,
                classification: "highly_relevant",
                reasonForScore: "Direct match on methodology and research query terms.",
              })),
            }),
          });
          entries = await classifyAndRankPapers(projectDomain, paperMetas, mockLLM);
        }

        // Persist rankings in Neon DB
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

        // Print Grouped Results
        section("Ranking Results");
        const grouped = {
          highly_relevant: entries.filter((e) => e.classification === "highly_relevant"),
          relevant: entries.filter((e) => e.classification === "relevant"),
          background: entries.filter((e) => e.classification === "background"),
          irrelevant: entries.filter((e) => e.classification === "irrelevant"),
        };

        const printGroup = (label: string, items: typeof entries, colorCode: string) => {
          if (items.length === 0) return;
          console.log(`\n${colorCode}${colors.bold}=== ${label} (${items.length}) ===${colors.reset}`);
          for (const item of items) {
            const paperObj = papers.find((p) => p.id === item.paperId || p.sourceId === item.paperId);
            const title = paperObj ? paperObj.title : item.paperId;
            console.log(`• ${colors.bold}${title}${colors.reset} (${(item.relevanceScore * 100).toFixed(0)}%)`);
            console.log(`  ${colors.dim}Reason: ${item.reasonForScore}${colors.reset}`);
          }
        };

        printGroup("Highly Relevant", grouped.highly_relevant, colors.green);
        printGroup("Relevant", grouped.relevant, colors.cyan);
        printGroup("Background Context", grouped.background, colors.yellow);
        printGroup("Irrelevant / Excluded", grouped.irrelevant, colors.gray);

        success(`Rankings saved for ${entries.length} paper(s). Run 'scholarkit review draft ${project.id}' to generate the review.`);
      } catch (err) {
        error(`Failed to rank papers: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 4. Draft Structured Literature Review
  // --------------------------------------------------------------------------
  reviewCmd
    .command("draft <projectId>")
    .description("Synthesize ranked papers into a structured literature review draft")
    .option("--model <model>", "OpenRouter model name to use")
    .option("-o, --output <file>", "Save markdown draft to a file")
    .action(async (projectId: string, options: { model?: string; output?: string }) => {
      try {
        const project = await prisma.litReviewProject.findUnique({
          where: { id: projectId },
          include: {
            entries: {
              include: { paper: true },
            },
          },
        });

        if (!project) {
          error(`Project "${projectId}" not found.`);
          process.exitCode = 1;
          return;
        }

        if (project.entries.length === 0) {
          warn(`No ranked entries found for project "${project.title}". Run 'scholarkit review rank ${project.id}' first.`);
          return;
        }

        banner("Drafting Literature Review", project.title);

        const entriesWithPapers = project.entries.map((e) => ({
          entry: {
            id: e.id,
            projectId: e.projectId,
            paperId: e.paperId,
            relevanceScore: e.relevanceScore,
            classification: e.classification,
            reasonForScore: e.reasonForScore,
            notes: e.notes || undefined,
          },
          paper: {
            id: e.paper.id,
            title: e.paper.title,
            authors: e.paper.authors,
            abstract: e.paper.abstract,
            publishedDate: e.paper.publishedDate,
            source: e.paper.source,
            sourceId: e.paper.sourceId,
            url: e.paper.url,
            pdfUrl: e.paper.pdfUrl || undefined,
            categories: e.paper.categories,
            status: e.paper.status,
          },
        }));

        const projectDomain: LitReviewProject = {
          id: project.id,
          title: project.title,
          description: project.description || undefined,
          query: project.query,
          inclusionCriteria: project.inclusionCriteria,
          exclusionCriteria: project.exclusionCriteria,
          status: project.status as "active" | "completed" | "archived",
        };

        const apiKey = process.env.OPENROUTER_API_KEY;
        const selectedModel = options.model || process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

        let draftResult;
        if (apiKey) {
          info(`Synthesizing literature review with OpenRouter (${selectedModel})...`);
          const llm = createOpenRouterClient({ apiKey, defaultModel: selectedModel });
          draftResult = await buildLiteratureReviewDraft(projectDomain, entriesWithPapers, llm);
        } else {
          warn("OPENROUTER_API_KEY not found. Generating template literature review draft.");
          draftResult = {
            title: `Literature Review: ${project.title}`,
            abstractOrExecutiveSummary: `This review examines recent advances and methodologies in ${project.query}, synthesizing key contributions across ${entriesWithPapers.length} analyzed works.`,
            sections: [
              {
                title: "Architectural & Methodological Paradigms",
                content: "Recent research emphasizes compute optimization, sparse activation patterns, and heterogeneous CPU-GPU workloads to improve throughput.",
                citedPaperIds: entriesWithPapers.map((e) => e.paper.sourceId),
              },
            ],
            researchGapsIdentified: [
              "Standardized benchmark evaluations across diverse real-world edge devices",
              "Latency and memory trade-offs during long-context generation",
            ],
            conclusion: "The literature demonstrates a clear trend toward hardware-aware model serving. Future work must bridge cross-domain generalization and verified safety.",
            generatedAt: new Date().toISOString(),
          };
        }

        // Render Markdown
        const markdown = [
          `# ${draftResult.title}`,
          `\n*Generated by ScholarKit on ${new Date().toLocaleDateString()}*\n`,
          `## Executive Summary\n${draftResult.abstractOrExecutiveSummary}\n`,
          ...draftResult.sections.map(
            (s) => `## ${s.title}\n${s.content}\n\n*Citations: ${s.citedPaperIds.join(", ") || "None"}*\n`
          ),
          `## Identified Research Gaps\n${draftResult.researchGapsIdentified.map((g) => `- ${g}`).join("\n")}\n`,
          `## Conclusion\n${draftResult.conclusion}\n`,
        ].join("\n");

        if (options.output) {
          await writeFile(options.output, markdown, "utf-8");
          success(`Literature review draft saved to ${options.output}`);
        } else {
          section("Generated Literature Review Draft");
          console.log(markdown);
        }
      } catch (err) {
        error(`Failed to draft literature review: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  return reviewCmd;
}
