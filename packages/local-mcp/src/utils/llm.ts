import {
  createOpenRouterClient,
  createMockLLMClient,
  LLMClient,
  SCHOLARKIT_CONFIG,
} from "@scholarkit/core";
import { logger } from "../logger.js";

export function getLlmClient(modelOverride?: string): LLMClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const defaultModel =
    modelOverride || process.env.OPENROUTER_MODEL || SCHOLARKIT_CONFIG.defaultModel;

  if (apiKey) {
    logger.debug(`Instantiating OpenRouter LLM client (model: ${defaultModel})`);
    return createOpenRouterClient({
      apiKey,
      defaultModel,
    });
  }

  logger.warn("OPENROUTER_API_KEY not found in environment. Falling back to deterministic Mock LLM client.");
  return createMockLLMClient();
}
