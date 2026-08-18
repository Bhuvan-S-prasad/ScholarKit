import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { ScholarKitMcpServer } from "./server.js";
import { logger } from "./logger.js";

// Load environment variables from repo root or local directory
dotenv.config();

export async function main() {
  const mcpServer = new ScholarKitMcpServer(true);
  const transport = new StdioServerTransport();

  logger.info("Initializing ScholarKit Local MCP Server over stdio...");
  logger.info(`Loaded ${mcpServer.getToolNames().length} MCP tools across 3 pillars.`);

  const serverInstance = mcpServer.getServerInstance();
  await serverInstance.connect(transport);

  logger.info("ScholarKit Local MCP Server connected and listening on stdio.");

  const shutdown = async () => {
    logger.info("Shutting down ScholarKit Local MCP Server...");
    try {
      await serverInstance.close();
    } catch (err) {
      logger.error("Error closing server instance:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Automatically start when executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("index.ts")) {
  main().catch((err) => {
    logger.error("Fatal error running MCP server:", err);
    process.exit(1);
  });
}

export * from "./server.js";
export * from "./types.js";
export * from "./logger.js";
export * from "./tools/index.js";
