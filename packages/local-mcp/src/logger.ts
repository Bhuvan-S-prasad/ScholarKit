/**
 * Safe logger for MCP stdio transport.
 * Standard output (stdout) is strictly reserved for JSON-RPC messages.
 * All logs, warnings, and diagnostic information MUST go to standard error (stderr).
 */
export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    console.error(`[scholarkit-mcp:info] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.error(`[scholarkit-mcp:warn] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[scholarkit-mcp:error] ${msg}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.DEBUG || process.env.SCHOLARKIT_DEV === "1") {
      console.error(`[scholarkit-mcp:debug] ${msg}`, ...args);
    }
  },
};
