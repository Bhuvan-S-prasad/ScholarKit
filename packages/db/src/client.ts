import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Creates or retrieves a singleton PrismaClient instance.
 * Ensures connection re-use across short-lived CLI invocations and hot-reloading dev servers.
 * Connects out to Neon via the pooled DATABASE_URL.
 */
export const prisma: PrismaClient =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export * from "@prisma/client";
