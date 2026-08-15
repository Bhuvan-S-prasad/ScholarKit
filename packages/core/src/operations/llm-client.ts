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
  schema: z.ZodType<T, any, any>;
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
  schema: z.ZodType<T, any, any>,
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

// ============================================================================
// Concrete OpenRouter LLM Client
// ============================================================================

export interface OpenRouterClientOptions {
  apiKey: string;
  defaultModel?: string;
  siteUrl?: string;
  appName?: string;
  baseUrl?: string;
}

/**
 * Creates an injectable LLMClient backed by OpenRouter (https://openrouter.ai).
 * Handles structured JSON completion, schema validation, and 1 automatic retry on validation failure.
 */
export function createOpenRouterClient(options: OpenRouterClientOptions): LLMClient {
  const {
    apiKey,
    defaultModel = "openai/gpt-oss-20b:free",
    siteUrl = "https://github.com/Bhuvan-S-prasad/ScholarKit",
    appName = "ScholarKit",
    baseUrl = "https://openrouter.ai/api/v1/chat/completions",
  } = options;

  if (!apiKey) {
    throw new LLMClientError("OPENROUTER_API_KEY is required to initialize OpenRouter client.");
  }

  async function callApi(
    messages: Array<{ role: string; content: string }>,
    temperature = 0.1,
    responseFormatJson = false
  ): Promise<string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": appName,
    };

    const body: Record<string, unknown> = {
      model: defaultModel,
      messages,
      temperature,
    };

    if (responseFormatJson) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMClientError(
        `OpenRouter API error (${response.status} ${response.statusText}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new LLMClientError("OpenRouter returned an empty completion response.");
    }

    return content;
  }

  return {
    async generateStructured<T>(opts: StructuredPromptOptions<T>): Promise<T> {
      const messages: Array<{ role: string; content: string }> = [];
      const jsonSystemPrompt = `${opts.systemPrompt || "You are an expert AI research analyst."}

You MUST respond strictly with valid JSON conforming to the '${opts.schemaName}' schema. Do NOT include any explanations, markdown code blocks, or preamble outside the JSON object.`;

      messages.push({ role: "system", content: jsonSystemPrompt });
      messages.push({ role: "user", content: opts.userPrompt });

      const rawFirstAttempt = await callApi(messages, opts.temperature ?? 0.1, true);

      try {
        const parsed = extractJsonFromText(rawFirstAttempt);
        return validateStructuredOutput(parsed, opts.schema, rawFirstAttempt);
      } catch (firstError) {
        // Retry exactly once with validation feedback fed back into the prompt (AGENTS.md §2)
        const issuesMsg =
          firstError instanceof StructuredOutputValidationError
            ? firstError.message
            : (firstError as Error).message;

        messages.push({ role: "assistant", content: rawFirstAttempt });
        messages.push({
          role: "user",
          content: `Your previous response failed schema validation with error:\n${issuesMsg}\n\nPlease output ONLY corrected valid JSON strictly conforming to the '${opts.schemaName}' schema.`,
        });

        const rawSecondAttempt = await callApi(messages, opts.temperature ?? 0.1, true);
        const parsedSecond = extractJsonFromText(rawSecondAttempt);
        return validateStructuredOutput(parsedSecond, opts.schema, rawSecondAttempt);
      }
    },

    async generateText(opts: TextPromptOptions): Promise<string> {
      const messages: Array<{ role: string; content: string }> = [];
      if (opts.systemPrompt) {
        messages.push({ role: "system", content: opts.systemPrompt });
      }
      messages.push({ role: "user", content: opts.userPrompt });

      return callApi(messages, opts.temperature ?? 0.7, false);
    },
  };
}
