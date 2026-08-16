import { PaperMetadata, PaperMetadataSchema } from "../schemas.js";

/**
 * Normalizes arXiv identifiers from URLs, prefixes, or bare IDs.
 * Supports modern format (e.g., "2312.12456", "2312.12456v1") and legacy format (e.g., "math/0306138").
 */
export function normalizeArxivId(input: string): string {
  const trimmed = input.trim();
  // Strip http:// or https:// arxiv.org/abs/ or /pdf/
  const urlMatch = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/([a-zA-Z\-]+(?:\.[a-zA-Z]+)?\/\d+|\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\.pdf$/i, "");
  }
  // Strip "arxiv:" prefix
  const prefixMatch = trimmed.replace(/^arxiv:\s*/i, "");
  return prefixMatch.replace(/\.pdf$/i, "");
}

/**
 * Pure helper to construct the arXiv API query URL for fetching metadata by ID.
 */
export function buildArxivApiUrl(arxivId: string): string {
  const cleanId = normalizeArxivId(arxivId);
  return `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`;
}

/**
 * Pure helper to construct the arXiv API search query URL.
 */
export function buildArxivSearchUrl(
  query: string,
  maxResults: number = 8,
  sortBy: "relevance" | "lastUpdatedDate" | "submittedDate" = "relevance"
): string {
  const cleanQuery = query.trim();
  return `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQuery)}&start=0&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=descending`;
}

/**
 * Fetches and parses arXiv papers matching a free-text search query.
 */
export async function searchArxivPapers(
  query: string,
  options?: { maxResults?: number; fetchFn?: typeof fetch }
): Promise<PaperMetadata[]> {
  const fetchImpl = options?.fetchFn || fetch;
  const url = buildArxivSearchUrl(query, options?.maxResults || 8);
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`arXiv search API returned HTTP ${res.status}: ${res.statusText}`);
  }
  const xml = await res.text();
  return parseArxivAtomFeed(xml);
}

/**
 * Extracts inner text of an XML tag safely using regex (pure, zero external deps).
 */
function extractXmlTag(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match && match[1] ? match[1].trim() : "";
}

/**
 * Extracts multiple occurrences of an XML tag.
 */
function extractXmlTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1]) {
      matches.push(match[1].trim());
    }
  }
  return matches;
}

/**
 * Pure parser for arXiv Atom XML feed responses.
 */
export function parseArxivAtomFeed(xml: string): PaperMetadata[] {
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  const papers: PaperMetadata[] = [];
  let entryMatch;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entryXml = entryMatch[1];
    if (!entryXml) continue;

    const rawId = extractXmlTag(entryXml, "id");
    const arxivId = normalizeArxivId(rawId);
    const rawTitle = extractXmlTag(entryXml, "title");
    const title = rawTitle.replace(/\s+/g, " "); // Clean newlines/extra whitespace
    const rawSummary = extractXmlTag(entryXml, "summary");
    const abstract = rawSummary.replace(/\s+/g, " ");
    const published = extractXmlTag(entryXml, "published");

    // Authors
    const authorBlocks = extractXmlTags(entryXml, "author");
    const authors = authorBlocks.map((block) => extractXmlTag(block, "name")).filter(Boolean);

    // Categories
    const categoryMatches = entryXml.match(/<category[^>]*term="([^"]+)"/gi) || [];
    const categories = categoryMatches
      .map((tag) => {
        const match = tag.match(/term="([^"]+)"/i);
        return match && match[1] ? match[1] : "";
      })
      .filter(Boolean);

    // PDF link
    const pdfMatch = entryXml.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/i);
    const pdfUrl = pdfMatch && pdfMatch[1] ? pdfMatch[1] : `https://arxiv.org/pdf/${arxivId}.pdf`;

    const paperData = {
      title: title || "Untitled arXiv Paper",
      authors: authors.length > 0 ? authors : ["Unknown Author"],
      abstract: abstract || "No abstract provided",
      publishedDate: published ? new Date(published).toISOString().split("T")[0]! : new Date().toISOString().split("T")[0]!,
      source: "arxiv" as const,
      sourceId: arxivId,
      url: `https://arxiv.org/abs/${arxivId}`,
      pdfUrl,
      categories,
      status: "ingested" as const,
    };

    papers.push(PaperMetadataSchema.parse(paperData));
  }

  return papers;
}
