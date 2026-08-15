import { z } from "zod";

// ============================================================================
// Errors
// ============================================================================

export class LLMClientError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LLMClientError";
  }
}

export class StructuredOutputValidationError extends Error {
  constructor(
    message: string,
    public readonly validationIssues: z.ZodIssue[],
    public readonly rawOutput?: string
  ) {
    super(message);
    this.name = "StructuredOutputValidationError";
  }
}

// ============================================================================
// Interfaces
// ============================================================================

export interface StructuredPromptOptions<T> {
  systemPrompt?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  maxRetries?: number; // Defaults to 1 retry on parse/validation failure
}

export interface TextPromptOptions {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
}

export interface LLMClient {
  generateStructured<T>(options: StructuredPromptOptions<T>): Promise<T>;
  generateText(options: TextPromptOptions): Promise<string>;
}

// ============================================================================
// Robust Structured Output Helper with 1 Retry on Validation Error
// ============================================================================

/**
 * Extracts and parses JSON from raw LLM output, accommodating markdown code fences.
 */
export function extractJsonFromText(rawText: string): unknown {
  let cleaned = rawText.trim();
  // Strip ```json ... ``` or ``` ... ``` code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new StructuredOutputValidationError(
      `Failed to parse LLM response as JSON: ${(err as Error).message}`,
      [],
      rawText
    );
  }
}

/**
 * Validates parsed JSON against the provided Zod schema.
 */
export function validateStructuredOutput<T>(
  data: unknown,
  schema: z.ZodType<T>,
  rawText?: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new StructuredOutputValidationError(
      `Schema validation failed for structured output: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      result.error.issues,
      rawText
    );
  }
  return result.data;
}


export interface MockLLMHandlers {
  onStructured?: (options: StructuredPromptOptions<unknown>) => unknown | Promise<unknown>;
  onText?: (options: TextPromptOptions) => string | Promise<string>;
}

export function createMockLLMClient(handlers: MockLLMHandlers = {}): LLMClient {
  return {
    async generateStructured<T>(options: StructuredPromptOptions<T>): Promise<T> {
      if (handlers.onStructured) {
        const result = await handlers.onStructured(options as StructuredPromptOptions<unknown>);
        return validateStructuredOutput(result, options.schema);
      }
      throw new LLMClientError(
        `MockLLMClient: No mock response provided for schema ${options.schemaName}`
      );
    },
    async generateText(options: TextPromptOptions): Promise<string> {
      if (handlers.onText) {
        return handlers.onText(options);
      }
      return `[Mock response for: ${options.userPrompt.slice(0, 30)}...]`;
    },
  };
}
