import { describe, it, expect, beforeEach } from "bun:test";
import { ScholarKitMcpServer } from "../src/server.js";
import { zodToJsonSchema } from "../src/utils/schema.js";
import { getAllTools } from "../src/tools/index.js";
import { z } from "zod";

describe("ScholarKit Local MCP Server (Phase 2)", () => {
  let server: ScholarKitMcpServer;

  beforeEach(() => {
    server = new ScholarKitMcpServer(true);
  });

  describe("Server Initialization & Tool Registration", () => {
    it("registers all 18 tools across the 3 functional pillars", () => {
      const toolNames = server.getToolNames();
      expect(toolNames.length).toBe(18);

      // Pillar 1: Papers
      expect(toolNames).toContain("ingest_paper");
      expect(toolNames).toContain("extract_paper");
      expect(toolNames).toContain("analyze_papers");
      expect(toolNames).toContain("list_papers");
      expect(toolNames).toContain("get_paper");

      // Pillar 2: Literature Reviews
      expect(toolNames).toContain("create_review_project");
      expect(toolNames).toContain("search_arxiv_papers");
      expect(toolNames).toContain("rank_papers");
      expect(toolNames).toContain("draft_literature_review");
      expect(toolNames).toContain("bridge_review_to_briefing");
      expect(toolNames).toContain("list_review_projects");

      // Pillar 3: Research Briefings
      expect(toolNames).toContain("draft_briefing");
      expect(toolNames).toContain("transition_briefing_status");
      expect(toolNames).toContain("schedule_briefing");
      expect(toolNames).toContain("dispatch_scheduled_briefings");
      expect(toolNames).toContain("send_briefing");
      expect(toolNames).toContain("preview_briefing_telegram");
      expect(toolNames).toContain("list_briefings");
    });

    it("ensures every tool provides a name, description, and valid parameter schema", () => {
      const tools = getAllTools();
      expect(tools.length).toBe(18);

      for (const tool of tools) {
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(10);
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.execute).toBe("function");

        const jsonSchema = zodToJsonSchema(tool.parameters);
        expect(jsonSchema.type).toBe("object");
      }
    });
  });

  describe("Zod to JSON Schema Converter Utility", () => {
    it("converts primitive and complex Zod schemas correctly", () => {
      const TestSchema = z.object({
        query: z.string().describe("Search query"),
        limit: z.number().optional().default(10).describe("Result limit"),
        filter: z.enum(["active", "archived"]).describe("Status filter"),
        tags: z.array(z.string()).optional().describe("Tag list"),
      });

      const converted = zodToJsonSchema(TestSchema);
      expect(converted.type).toBe("object");
      expect(converted.properties).toBeDefined();

      const props = converted.properties as Record<string, any>;
      expect(props.query.type).toBe("string");
      expect(props.query.description).toBe("Search query");
      expect(props.limit.type).toBe("number");
      expect(props.filter.type).toBe("string");
      expect(props.filter.enum).toEqual(["active", "archived"]);
      expect(props.tags.type).toBe("array");

      const required = converted.required as string[];
      expect(required).toContain("query");
      expect(required).toContain("filter");
      expect(required).not.toContain("limit");
      expect(required).not.toContain("tags");
    });
  });

  describe("Tool Execution Error Handling", () => {
    it("returns a structured error message when required parameters fail validation", async () => {
      const tools = getAllTools();
      const ingestTool = tools.find((t) => t.name === "ingest_paper")!;

      // Invalid arguments (missing arxivIdOrUrl)
      expect(() => ingestTool.parameters.parse({})).toThrow();
    });
  });
});
