/**
 * ScholarKit Global Configuration Defaults
 * Single source of truth for runtime defaults across core, CLI, TUI, and MCP servers.
 */

export const SCHOLARKIT_CONFIG = {
  /**
   * Default OpenRouter model identifier.
   * Can be overridden at runtime via OPENROUTER_MODEL environment variable or CLI --model flag.
   */
  defaultModel: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",

  /**
   * OpenRouter API headers & identification.
   */
  siteUrl: "https://github.com/Bhuvan-S-prasad/ScholarKit",
  appName: "ScholarKit",
  openRouterApiUrl: "https://openrouter.ai/api/v1/chat/completions",

  /**
   * Default extraction confidence threshold (below which a paper is flagged for human review).
   */
  confidenceThreshold: 0.75,

  /**
   * Telegram message max character length limit.
   */
  telegramMaxMessageLength: 4096,

  /**
   * Telegram send rate-limit pacing (milliseconds).
   */
  telegramSendPacingMs: 1000,
} as const;

export const DEFAULT_LLM_MODEL = SCHOLARKIT_CONFIG.defaultModel;
