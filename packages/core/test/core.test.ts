import { describe, expect, it } from "bun:test";
import {
  // Schemas
  PaperMetadataSchema,
  PaperExtractionSchema,
  // Operations
  parseArxivAtomFeed,
  normalizeArxivId,
  buildArxivSearchUrl,
  searchArxivPapers,
  createStubExtraction,
  evaluateExtractionConfidence,
  extractPaperData,
  createMockLLMClient,
  deduplicatePapers,
  transitionReviewStatus,
  InvalidWorkflowTransitionError,
  chunkTelegramMessage,
  createNewsletterDraft,
  createNewsletterFromLiteratureReview,
  createNewsletterFromRecentPapers,
  formatNewsletterForTelegramHtml,
  isDueForDelivery,
  evaluateScheduledQueue,
} from "../src/index.js";

describe("ScholarKit Core", () => {
  describe("Zod Domain Schemas", () => {
    it("validates valid paper metadata", () => {
      const validPaper = {
        title: "Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        abstract: "The dominant sequence transduction models...",
        publishedDate: "2017-06-12",
        source: "arxiv",
        sourceId: "1706.03762",
        url: "https://arxiv.org/abs/1706.03762",
      };
      const parsed = PaperMetadataSchema.parse(validPaper);
      expect(parsed.title).toBe("Attention Is All You Need");
      expect(parsed.status).toBe("ingested");
    });

    it("rejects invalid paper metadata with empty title or authors", () => {
      const invalidPaper = {
        title: "",
        authors: [],
        abstract: "test",
        publishedDate: "2023-01-01",
        source: "arxiv",
        sourceId: "1234.5678",
        url: "not-a-url",
      };
      expect(() => PaperMetadataSchema.parse(invalidPaper)).toThrow();
    });
  });

  describe("Ingestion & Parsing Operations", () => {
    it("normalizes various arXiv ID formats", () => {
      expect(normalizeArxivId("2312.12456")).toBe("2312.12456");
      expect(normalizeArxivId("arxiv:2312.12456v2")).toBe("2312.12456v2");
      expect(normalizeArxivId("https://arxiv.org/abs/2312.12456")).toBe("2312.12456");
      expect(normalizeArxivId("https://arxiv.org/pdf/2312.12456.pdf")).toBe("2312.12456");
    });

    it("parses arXiv Atom feed XML into structured PaperMetadata", () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2312.12456v1</id>
    <title>LLM Agents for Scientific Discovery</title>
    <summary>We introduce a novel agent framework for automated research.</summary>
    <published>2023-12-19T18:00:00Z</published>
    <author><name>Alice Researcher</name></author>
    <author><name>Bob Scientist</name></author>
    <category term="cs.AI" />
    <link title="pdf" href="https://arxiv.org/pdf/2312.12456v1.pdf" />
  </entry>
</feed>`;

      const papers = parseArxivAtomFeed(sampleXml);
      expect(papers.length).toBe(1);
      expect(papers[0]?.title).toBe("LLM Agents for Scientific Discovery");
      expect(papers[0]?.authors).toEqual(["Alice Researcher", "Bob Scientist"]);
      expect(papers[0]?.sourceId).toBe("2312.12456v1");
      expect(papers[0]?.source).toBe("arxiv");
    });

    it("constructs valid arXiv search query URLs", () => {
      const url = buildArxivSearchUrl("quantum computing error mitigation", 5);
      expect(url).toContain("search_query=all:quantum%20computing%20error%20mitigation");
      expect(url).toContain("max_results=5");
      expect(url).toContain("sortBy=relevance");
    });

    it("fetches and parses multi-paper search results with injected fetch mock", async () => {
      const mockMultiXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001</id>
    <title>Sparse Neural Networks</title>
    <summary>First paper on sparsity.</summary>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Author A</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.00002</id>
    <title>Mixture of Experts Serving</title>
    <summary>Second paper on MoE serving.</summary>
    <published>2024-01-02T00:00:00Z</published>
    <author><name>Author B</name></author>
  </entry>
</feed>`;

      const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
        return new Response(mockMultiXml, { status: 200, statusText: "OK" });
      };

      const results = await searchArxivPapers("sparse networks", {
        maxResults: 2,
        fetchFn: mockFetch,
      });

      expect(results.length).toBe(2);
      expect(results[0]?.sourceId).toBe("2401.00001");
      expect(results[0]?.title).toBe("Sparse Neural Networks");
      expect(results[1]?.sourceId).toBe("2401.00002");
      expect(results[1]?.title).toBe("Mixture of Experts Serving");
    });
  });

  describe("Extraction & Injected LLM Operations", () => {
    const testPaper = {
      title: "Test Paper",
      authors: ["Author 1"],
      abstract: "Abstract summary",
      publishedDate: "2024-01-01",
      source: "arxiv" as const,
      sourceId: "2401.00001",
      url: "https://arxiv.org/abs/2401.00001",
      categories: ["cs.AI"],
      status: "ingested" as const,
    };

    it("creates a deterministic stub extraction without LLM", () => {
      const stub = createStubExtraction(testPaper);
      expect(stub.confidence).toBe(0.9);
      expect(stub.keyFindings.length).toBeGreaterThan(0);
      expect(() => PaperExtractionSchema.parse(stub)).not.toThrow();
    });

    it("evaluates confidence threshold and flags low confidence for human review", () => {
      const highConfidence = { ...createStubExtraction(testPaper), confidence: 0.95 };
      const lowConfidence = { ...createStubExtraction(testPaper), confidence: 0.45 };

      expect(evaluateExtractionConfidence(highConfidence).flagForHumanReview).toBe(false);
      expect(evaluateExtractionConfidence(lowConfidence).flagForHumanReview).toBe(true);
    });

    it("extracts structured data using injected mock LLM client", async () => {
      const mockLLM = createMockLLMClient({
        onStructured: () => ({
          methodology: {
            approach: "Deep Reinforcement Learning",
            toolsOrFrameworks: ["PyTorch"],
          },
          keyFindings: ["Achieved state of the art results"],
          contributions: ["Introduced new benchmark"],
          limitations: ["High memory footprint"],
          confidence: 0.92,
        }),
      });

      const extraction = await extractPaperData(testPaper, "Full text here...", mockLLM);
      expect(extraction.confidence).toBe(0.92);
      expect(extraction.methodology.approach).toBe("Deep Reinforcement Learning");
      expect(extraction.paperId).toBe("2401.00001");
    });
  });

  describe("Literature Review Operations", () => {
    it("deduplicates papers with identical sourceId or title", () => {
      const papers = [
        {
          title: "Exact Paper Title",
          authors: ["A"],
          abstract: "...",
          publishedDate: "2024-01-01",
          source: "arxiv" as const,
          sourceId: "1111.1111",
          url: "https://arxiv.org/abs/1111.1111",
          categories: [],
          status: "ingested" as const,
        },
        {
          title: "Exact Paper Title", // duplicate title
          authors: ["A"],
          abstract: "...",
          publishedDate: "2024-01-01",
          source: "arxiv" as const,
          sourceId: "2222.2222",
          url: "https://arxiv.org/abs/2222.2222",
          categories: [],
          status: "ingested" as const,
        },
        {
          title: "Different Paper Title",
          authors: ["B"],
          abstract: "...",
          publishedDate: "2024-01-01",
          source: "arxiv" as const,
          sourceId: "3333.3333",
          url: "https://arxiv.org/abs/3333.3333",
          categories: [],
          status: "ingested" as const,
        },
      ];

      const deduplicated = deduplicatePapers(papers);
      expect(deduplicated.length).toBe(2);
    });
  });

  describe("Newsletter Review State Machine", () => {
    it("transitions through the happy path: draft -> in_review -> approved -> scheduled -> sending -> sent", () => {
      let status = transitionReviewStatus("draft", "submit_for_review");
      expect(status).toBe("in_review");

      status = transitionReviewStatus(status, "approve");
      expect(status).toBe("approved");

      status = transitionReviewStatus(status, "schedule");
      expect(status).toBe("scheduled");

      status = transitionReviewStatus(status, "start_sending");
      expect(status).toBe("sending");

      status = transitionReviewStatus(status, "mark_sent");
      expect(status).toBe("sent");
    });

    it("supports the retry branch: sending -> failed -> retry -> sending", () => {
      let status = transitionReviewStatus("sending", "mark_failed");
      expect(status).toBe("failed");

      status = transitionReviewStatus(status, "retry");
      expect(status).toBe("sending");
    });

    it("rejects illegal transitions", () => {
      expect(() => transitionReviewStatus("draft", "mark_sent")).toThrow(
        InvalidWorkflowTransitionError
      );
      expect(() => transitionReviewStatus("changes_requested", "schedule")).toThrow(
        InvalidWorkflowTransitionError
      );
    });
  });

  describe("Telegram Publishing & Chunking", () => {
    it("returns a single chunk when text is under 4096 chars", () => {
      const shortText = "Short digest text.";
      const chunks = chunkTelegramMessage(shortText);
      expect(chunks.length).toBe(1);
      expect(chunks[0]?.totalChunks).toBe(1);
      expect(chunks[0]?.text).toBe(shortText);
    });

    it("chunks messages exceeding 4096 chars cleanly without slicing words", () => {
      const paragraph = "This is a repeated paragraph in a long research paper newsletter.\n\n";
      const longText = paragraph.repeat(100); // ~6700 characters
      expect(longText.length).toBeGreaterThan(4096);

      const chunks = chunkTelegramMessage(longText, "12345");
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(4096);
        expect(chunk.chatId).toBe("12345");
      }
    });

    it("formats a full newsletter draft into Telegram HTML", () => {
      const newsletter = createNewsletterDraft("Weekly Research Digest", [
        {
          title: "Breakthroughs in Reasoning",
          content: "Recent papers have demonstrated emergent reasoning capabilities...",
          order: 1,
          sectionType: "deep_dive",
          paperReferences: ["2401.12345"],
        },
      ]);
      const html = formatNewsletterForTelegramHtml(newsletter);
      expect(html).toContain("Weekly Research Digest");
      expect(html).toContain("Breakthroughs in Reasoning");
    });
  });

  describe("Newsletter Synthesis Bridges & Scheduler Operations", () => {
    const samplePaper = {
      title: "Sparse Activation in Neural Networks",
      authors: ["Alice Expert", "Bob Engineer"],
      abstract: "Methods for sparse compute and execution...",
      publishedDate: "2024-01-15",
      source: "arxiv" as const,
      sourceId: "2401.55555",
      url: "https://arxiv.org/abs/2401.55555",
      status: "ingested" as const,
    };

    it("synthesizes a structured Newsletter from a Literature Review Draft", () => {
      const project = {
        id: "proj-1",
        title: "Sparse Activation Networks",
        query: "sparse neural compute",
        inclusionCriteria: ["sparsity >= 50%"],
        exclusionCriteria: [],
        status: "active" as const,
      };

      const draft = {
        title: "Synthesis of Sparse Activation",
        abstractOrExecutiveSummary: "Executive overview of sparse models.",
        sections: [
          {
            title: "Kernel Acceleration",
            content: "GPU kernel optimization for non-zero activations.",
            citedPaperIds: ["2401.55555"],
          },
        ],
        researchGapsIdentified: ["Memory bandwidth limits on embedded devices"],
        conclusion: "Promising efficiency improvements observed.",
      };

      const newsletter = createNewsletterFromLiteratureReview(project, draft, [samplePaper], {
        issueNumber: 1,
      });

      expect(newsletter.title).toContain("Sparse Activation Networks");
      expect(newsletter.issueNumber).toBe(1);
      expect(newsletter.status).toBe("draft");
      expect(newsletter.sections.length).toBe(4); // intro + deep_dive + quick_takes + outro
      expect(newsletter.sections[0]?.sectionType).toBe("intro");
      expect(newsletter.sections[1]?.title).toBe("Kernel Acceleration");
      expect(newsletter.sections[2]?.sectionType).toBe("quick_takes");
      expect(newsletter.sections[3]?.sectionType).toBe("outro");
    });

    it("synthesizes a structured Newsletter digest from Recent Ingested Papers", () => {
      const newsletter = createNewsletterFromRecentPapers([samplePaper], {
        issueNumber: 2,
        title: "Weekly AI Digest #2",
      });

      expect(newsletter.title).toBe("Weekly AI Digest #2");
      expect(newsletter.issueNumber).toBe(2);
      expect(newsletter.sections.length).toBe(3); // intro + paper summary + outro
      expect(newsletter.sections[1]?.title).toBe(samplePaper.title);
      expect(newsletter.sections[1]?.paperReferences).toEqual(["2401.55555"]);
    });

    it("evaluates scheduled queue and checks due delivery status correctly", () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const futureDate = new Date(Date.now() + 3600000).toISOString();

      const dueItem = {
        id: "n-1",
        status: "scheduled",
        scheduledAt: pastDate,
      };

      const futureItem = {
        id: "n-2",
        status: "scheduled",
        scheduledAt: futureDate,
      };

      const draftItem = {
        id: "n-3",
        status: "draft",
        scheduledAt: pastDate,
      };

      expect(isDueForDelivery(dueItem)).toBe(true);
      expect(isDueForDelivery(futureItem)).toBe(false);
      expect(isDueForDelivery(draftItem)).toBe(false);

      const { due, upcoming } = evaluateScheduledQueue([dueItem, futureItem, draftItem]);
      expect(due.length).toBe(1);
      expect(due[0]?.id).toBe("n-1");
      expect(upcoming.length).toBe(1);
      expect(upcoming[0]?.id).toBe("n-2");
    });
  });
});
