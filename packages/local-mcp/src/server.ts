import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { McpToolHandler } from "./types.js";
import { zodToJsonSchema } from "./utils/schema.js";
import { logger } from "./logger.js";
import { getAllTools } from "./tools/index.js";

export class ScholarKitMcpServer {
  private server: Server;
  private tools: Map<string, McpToolHandler> = new Map();

  constructor(autoRegisterTools = true) {
    this.server = new Server(
      {
        name: "scholarkit-local-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    if (autoRegisterTools) {
      this.registerTools(getAllTools());
    }

    this.setupHandlers();
  }

  public registerTool(tool: McpToolHandler): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool "${tool.name}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  public registerTools(tools: McpToolHandler[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  public getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  public getServerInstance(): Server {
    return this.server;
  }

  private setupHandlers(): void {
    // 1. List Available Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("Handling tools/list request");
      const toolList = Array.from(this.tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.parameters) as any,
      }));

      return {
        tools: toolList,
      };
    });

    // 2. Call Tool Execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      logger.info(`Invoking tool: ${name}`);

      const tool = this.tools.get(name);
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available tools: ${this.getToolNames().join(", ")}`
        );
      }

      try {
        const parsedArgs = tool.parameters.parse(rawArgs || {});
        const result = await tool.execute(parsedArgs);
        return result;
      } catch (err) {
        logger.error(`Error executing tool "${name}":`, (err as Error).message);
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool Execution Error [${name}]: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
}
