import { Command } from "commander";
import {
  parseArxivAtomFeed,
  normalizeArxivId,
  buildArxivApiUrl,
  createStubExtraction,
  evaluateExtractionConfidence,
  extractPaperData,
  createOpenRouterClient,
  comparePapers,
  PaperExtraction,
  PaperMetadata,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { banner, section, success, info, warn, error, confidenceBadge, colors } from "../utils/output.js";

export function createPaperCommand(): Command {
  const paperCmd = new Command("paper").description("Manage research papers (ingest, extract, analyze, and list)");

  // --------------------------------------------------------------------------
  // 1. Ingest Paper from arXiv
  // --------------------------------------------------------------------------
  paperCmd
    .command("ingest <identifier>")
    .description("Ingest an arXiv paper by ID or URL (e.g. 2312.12456 or https://arxiv.org/abs/2312.12456)")
    .action(async (identifier: string) => {
      try {
        const cleanId = normalizeArxivId(identifier);
        info(`Querying arXiv API for ID: ${cleanId}...`);

        const apiUrl = buildArxivApiUrl(cleanId);
        const res = await fetch(apiUrl);
        if (!res.ok) {
          throw new Error(`arXiv API returned HTTP ${res.status}: ${res.statusText}`);
        }

        const xmlText = await res.text();
        const papers = parseArxivAtomFeed(xmlText);

        if (papers.length === 0) {
          warn(`No paper found matching arXiv ID "${cleanId}".`);
          return;
        }

        const parsedPaper = papers[0]!;
        info(`Found paper: "${parsedPaper.title}"`);

        // Persist to Neon PostgreSQL
        const record = await prisma.paper.upsert({
          where: { sourceId: parsedPaper.sourceId },
          create: {
            title: parsedPaper.title,
            authors: parsedPaper.authors,
            abstract: parsedPaper.abstract,
            publishedDate: parsedPaper.publishedDate,
            source: parsedPaper.source,
            sourceId: parsedPaper.sourceId,
            url: parsedPaper.url,
            pdfUrl: parsedPaper.pdfUrl,
            categories: parsedPaper.categories,
            status: "ingested",
          },
          update: {
            title: parsedPaper.title,
            authors: parsedPaper.authors,
            abstract: parsedPaper.abstract,
            publishedDate: parsedPaper.publishedDate,
            url: parsedPaper.url,
            pdfUrl: parsedPaper.pdfUrl,
            categories: parsedPaper.categories,
          },
        });

        banner("Paper Ingested Successfully", `Neon DB Record ID: ${record.id}`);
        console.log(`${colors.bold}Title:${colors.reset}       ${record.title}`);
        console.log(`${colors.bold}Authors:${colors.reset}     ${record.authors.join(", ")}`);
        console.log(`${colors.bold}Published:${colors.reset}   ${record.publishedDate}`);
        console.log(`${colors.bold}Source ID:${colors.reset}   ${record.sourceId} (${record.source})`);
        console.log(`${colors.bold}URL:${colors.reset}         ${record.url}`);
        console.log(`${colors.bold}Categories:${colors.reset}  ${record.categories.join(", ") || "None"}`);
        console.log(`\n${colors.bold}Abstract:${colors.reset}\n${record.abstract}`);

        success(`Paper saved to database. Run 'scholarkit paper extract ${record.sourceId}' to analyze methodology & findings.`);
      } catch (err) {
        error(`Failed to ingest paper: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 2. List Ingested Papers
  // --------------------------------------------------------------------------
  paperCmd
    .command("list")
    .description("List all papers stored in the database")
    .action(async () => {
      try {
        const papers = await prisma.paper.findMany({
          orderBy: { createdAt: "desc" },
          include: { extraction: true },
        });

        if (papers.length === 0) {
          info("No papers found in database. Ingest your first paper using 'scholarkit paper ingest <arxiv-id>'.");
          return;
        }

        banner(`Ingested Papers (${papers.length})`);
        for (const p of papers) {
          const statusBadge =
            p.status === "extracted"
              ? `${colors.green}[Extracted]${colors.reset}`
              : p.status === "analyzed"
                ? `${colors.cyan}[Analyzed]${colors.reset}`
                : `${colors.yellow}[Ingested]${colors.reset}`;

          const conf = p.extraction ? confidenceBadge(p.extraction.confidence) : "";

          console.log(`${colors.bold}• [${p.sourceId}]${colors.reset} ${p.title} ${statusBadge} ${conf}`);
          console.log(`  ${colors.dim}DB ID: ${p.id} | Authors: ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} | Date: ${p.publishedDate}${colors.reset}`);
        }
      } catch (err) {
        error(`Failed to list papers: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 3. Extract Paper (Methodology, Findings, Limitations)
  // --------------------------------------------------------------------------
  paperCmd
    .command("extract <identifier>")
    .description("Extract structured methodology, findings, and limitations from a paper")
    .option("--stub", "Generate a deterministic stub extraction without calling the LLM")
    .option("--model <model>", "OpenRouter model name to use (defaults to OPENROUTER_MODEL env or gpt-oss-20b:free)")
    .action(async (identifier: string, options: { stub?: boolean; model?: string }) => {
      try {
        const cleanId = normalizeArxivId(identifier);

        // Lookup in Neon DB by sourceId or DB ID
        const paper = await prisma.paper.findFirst({
          where: {
            OR: [{ sourceId: cleanId }, { id: identifier }],
          },
        });

        if (!paper) {
          error(`Paper with identifier "${identifier}" not found in database. Ingest it first with 'scholarkit paper ingest ${identifier}'.`);
          process.exitCode = 1;
          return;
        }

        banner("Paper Extraction", paper.title);

        let extraction: PaperExtraction;

        const paperMetadata: PaperMetadata = {
          id: paper.id,
          title: paper.title,
          authors: paper.authors,
          abstract: paper.abstract,
          publishedDate: paper.publishedDate,
          source: paper.source,
          sourceId: paper.sourceId,
          url: paper.url,
          pdfUrl: paper.pdfUrl || undefined,
          categories: paper.categories,
          status: paper.status,
        };

        if (options.stub) {
          info("Running deterministic stub extraction (--stub requested)...");
          extraction = createStubExtraction(paperMetadata);
        } else {
          const apiKey = process.env.OPENROUTER_API_KEY;
          if (!apiKey) {
            warn("OPENROUTER_API_KEY not found in environment. Falling back to stub extraction (or set OPENROUTER_API_KEY in .env).");
            extraction = createStubExtraction(paperMetadata);
          } else {
            const selectedModel = options.model || process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";
            info(`Extracting with OpenRouter (Model: ${selectedModel})...`);

            const llm = createOpenRouterClient({
              apiKey,
              defaultModel: selectedModel,
            });

            // Feed abstract as primary content (or rawContent if cached)
            const content = paper.rawContent || paper.abstract;
            extraction = await extractPaperData(paperMetadata, content, llm);
          }
        }

        // Evaluate extraction confidence
        const confResult = evaluateExtractionConfidence(extraction);

        // Persist extraction in Neon DB
        await prisma.paperExtraction.upsert({
          where: { paperId: paper.id },
          create: {
            paperId: paper.id,
            methodology: extraction.methodology,
            keyFindings: extraction.keyFindings,
            contributions: extraction.contributions,
            limitations: extraction.limitations,
            confidence: extraction.confidence,
            extractionNotes: extraction.extractionNotes,
            extractedAt: new Date(extraction.extractedAt || Date.now()),
          },
          update: {
            methodology: extraction.methodology,
            keyFindings: extraction.keyFindings,
            contributions: extraction.contributions,
            limitations: extraction.limitations,
            confidence: extraction.confidence,
            extractionNotes: extraction.extractionNotes,
            extractedAt: new Date(extraction.extractedAt || Date.now()),
          },
        });

        await prisma.paper.update({
          where: { id: paper.id },
          data: { status: "extracted" },
        });

        // Print Results
        section("Extraction Results");
        console.log(`\nConfidence: ${confidenceBadge(extraction.confidence)}`);
        if (confResult.flagForHumanReview) {
          warn(confResult.reason || "Confidence flagged for human review.");
        }

        section("Methodology");
        console.log(`Approach:           ${extraction.methodology.approach}`);
        if (extraction.methodology.datasetInfo) {
          console.log(`Datasets:           ${extraction.methodology.datasetInfo}`);
        }
        if (extraction.methodology.toolsOrFrameworks.length > 0) {
          console.log(`Tools & Frameworks: ${extraction.methodology.toolsOrFrameworks.join(", ")}`);
        }

        section("Key Findings");
        for (const finding of extraction.keyFindings) {
          console.log(`• ${finding}`);
        }

        section("Core Contributions");
        for (const contrib of extraction.contributions) {
          console.log(`• ${contrib}`);
        }

        section("Identified Limitations");
        for (const limit of extraction.limitations) {
          console.log(`• ${limit}`);
        }

        success(`Extraction saved to database for "${paper.title}".`);
      } catch (err) {
        error(`Extraction failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 4. Comparative Analysis across Papers
  // --------------------------------------------------------------------------
  paperCmd
    .command("analyze <identifiers...>")
    .description("Perform comparative synthesis and research gap analysis across 2 or more papers")
    .option("--model <model>", "OpenRouter model name to use")
    .action(async (identifiers: string[], options: { model?: string }) => {
      try {
        if (identifiers.length < 2) {
          error("Comparative analysis requires at least two papers.");
          process.exitCode = 1;
          return;
        }

        const cleanIds = identifiers.map(normalizeArxivId);
        const papers = await prisma.paper.findMany({
          where: {
            OR: [{ sourceId: { in: cleanIds } }, { id: { in: identifiers } }],
          },
          include: { extraction: true },
        });

        if (papers.length < 2) {
          error(`Found only ${papers.length} matching paper(s) in DB. Please ingest all compared papers first.`);
          process.exitCode = 1;
          return;
        }

        banner("Cross-Paper Comparative Analysis", `${papers.length} papers selected`);

        // Ensure extractions exist (generate stubs if not extracted yet)
        const extractions: PaperExtraction[] = [];
        for (const p of papers) {
          if (p.extraction) {
            extractions.push({
              paperId: p.sourceId,
              methodology: p.extraction.methodology as any,
              keyFindings: p.extraction.keyFindings,
              contributions: p.extraction.contributions,
              limitations: p.extraction.limitations,
              confidence: p.extraction.confidence,
              extractionNotes: p.extraction.extractionNotes || undefined,
            });
          } else {
            info(`Paper [${p.sourceId}] had no prior extraction. Creating baseline extraction...`);
            extractions.push(
              createStubExtraction({
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
              })
            );
          }
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        const selectedModel = options.model || process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

        let analysisResult;
        if (apiKey) {
          info(`Generating comparative synthesis via OpenRouter (${selectedModel})...`);
          const llm = createOpenRouterClient({ apiKey, defaultModel: selectedModel });
          analysisResult = await comparePapers(extractions, llm);
        } else {
          warn("OPENROUTER_API_KEY not found. Using baseline comparison matrix.");
          analysisResult = {
            paperIds: papers.map((p) => p.sourceId),
            comparisonMatrix: [
              {
                topic: "Core Methodology",
                findingsByPaper: Object.fromEntries(
                  papers.map((p, i) => [p.sourceId, extractions[i]?.methodology.approach || "Standard"])
                ),
                synthesis: "Papers approach the problem with complementary computational strategies.",
              },
            ],
            commonLimitations: ["Evaluation datasets lack real-world edge cases", "Scalability constraints under large workloads"],
            researchGaps: ["Cross-domain generalization benchmarks", "Robustness verification under adversarial conditions"],
            practicalImplications: ["Enables automated summarization workflows", "Requires human validation for high-stakes domains"],
          };
        }

        section("Comparison Matrix");
        for (const item of analysisResult.comparisonMatrix) {
          console.log(`\n${colors.bold}Topic: ${item.topic}${colors.reset}`);
          for (const [pId, finding] of Object.entries(item.findingsByPaper)) {
            console.log(`  [${pId}]: ${finding}`);
          }
          console.log(`  ${colors.cyan}Synthesis:${colors.reset} ${item.synthesis}`);
        }

        section("Common Limitations");
        for (const lim of analysisResult.commonLimitations) {
          console.log(`• ${lim}`);
        }

        section("Identified Research Gaps");
        for (const gap of analysisResult.researchGaps) {
          console.log(`• ${gap}`);
        }

        section("Practical Implications");
        for (const imp of analysisResult.practicalImplications) {
          console.log(`• ${imp}`);
        }

        // Mark papers as analyzed
        await prisma.paper.updateMany({
          where: { id: { in: papers.map((p) => p.id) } },
          data: { status: "analyzed" },
        });

        success("Comparative analysis completed.");
      } catch (err) {
        error(`Analysis failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  return paperCmd;
}
