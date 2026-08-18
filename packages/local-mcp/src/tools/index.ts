import { McpToolDefinition } from "../types.js";
import { paperTools } from "./papers.js";
import { reviewTools } from "./reviews.js";
import { briefingTools } from "./briefings.js";

export * from "./papers.js";
export * from "./reviews.js";
export * from "./briefings.js";

export function getAllTools(): McpToolDefinition[] {
  return [...paperTools, ...reviewTools, ...briefingTools];
}
