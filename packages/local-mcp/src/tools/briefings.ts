import { z } from "zod";
import {
  createBriefingFromRecentPapers,
  createBriefingDraft,
  transitionReviewStatus,
  getAvailableWorkflowActions,
  evaluateScheduledQueue,
  formatBriefingForTelegramHtml,
  chunkTelegramMessage,
  sendTelegramChunks,
  WorkflowAction,
  ReviewStatus,
  PaperMetadata,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { McpToolDefinition } from "../types.js";

/**
 * 1. Draft a research briefing issue (from recent papers or custom sections).
 */
export const draftBriefingTool: McpToolDefinition = {
  name: "draft_briefing",
  description:
    "Create a new Research Briefing issue draft (either automatically assembled from recent papers or with custom sections).",
  parameters: z.object({
    title: z.string().describe("Title of the research briefing issue"),
    paperIds: z
      .array(z.string())
      .optional()
      .describe("Optional specific paper UUIDs to assemble the briefing from. If omitted, uses the 3 most recently ingested papers."),
    target: z
      .enum(["telegram_dm", "telegram_channel", "telegram_group"])
      .optional()
      .default("telegram_channel")
      .describe("Target delivery format"),
  }),
  execute: async ({ title, paperIds, target = "telegram_channel" }) => {
    let papers;
    if (paperIds && paperIds.length > 0) {
      papers = await prisma.paper.findMany({
        where: { id: { in: paperIds } },
        orderBy: { createdAt: "desc" },
      });
    } else {
      papers = await prisma.paper.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
      });
    }

    if (papers.length === 0) {
      throw new Error("No papers found in database to assemble briefing from. Ingest papers first via 'ingest_paper'.");
    }

    const domainPapers: PaperMetadata[] = papers.map((p) => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      abstract: p.abstract,
      publishedDate: p.publishedDate,
      source: p.source as any,
      sourceId: p.sourceId,
      url: p.url,
      pdfUrl: p.pdfUrl || undefined,
      categories: p.categories,
      status: p.status as any,
      rawContent: p.rawContent || undefined,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    const count = await prisma.briefing.count();
    const issueNumber = count + 1;

    const briefingDraft = createBriefingFromRecentPapers(domainPapers, {
      title,
      issueNumber,
      target,
    });

    const saved = await prisma.briefing.create({
      data: {
        title: briefingDraft.title,
        issueNumber: briefingDraft.issueNumber,
        contentType: briefingDraft.contentType,
        status: briefingDraft.status,
        target: briefingDraft.target,
        sections: {
          create: briefingDraft.sections.map((s) => ({
            title: s.title,
            content: s.content,
            order: s.order,
            sectionType: s.sectionType,
            paperReferences: s.paperReferences,
          })),
        },
      },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Drafted Research Briefing issue #${saved.issueNumber}`,
              briefingId: saved.id,
              issueNumber: saved.issueNumber,
              title: saved.title,
              status: saved.status,
              target: saved.target,
              sectionsCount: saved.sections.length,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 2. Advance the editorial review state machine.
 */
export const transitionBriefingStatusTool: McpToolDefinition = {
  name: "transition_briefing_status",
  description:
    "Advance a Research Briefing issue through the editorial review state machine (draft -> in_review -> approved -> scheduled -> sending -> sent, or request_changes / retry).",
  parameters: z.object({
    briefingId: z.string().describe("UUID of the research briefing"),
    action: z
      .enum([
        "submit_for_review",
        "approve",
        "request_changes",
        "schedule",
        "start_sending",
        "mark_sent",
        "mark_failed",
        "retry",
      ])
      .describe("Workflow action to execute"),
  }),
  execute: async ({ briefingId, action }) => {
    const briefing = await prisma.briefing.findUnique({
      where: { id: briefingId },
    });

    if (!briefing) {
      throw new Error(`Briefing not found with ID: ${briefingId}`);
    }

    const currentStatus = briefing.status as ReviewStatus;
    const nextStatus = transitionReviewStatus(currentStatus, action as WorkflowAction);

    const updated = await prisma.briefing.update({
      where: { id: briefingId },
      data: {
        status: nextStatus,
        scheduledAt: nextStatus === "scheduled" ? new Date(Date.now() + 3600000) : briefing.scheduledAt,
        sentAt: nextStatus === "sent" ? new Date() : briefing.sentAt,
      },
    });

    const nextAvailable = getAvailableWorkflowActions(updated.status as ReviewStatus);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              briefingId: updated.id,
              title: updated.title,
              previousStatus: currentStatus,
              action,
              currentStatus: updated.status,
              availableNextActions: nextAvailable,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 3. Schedule an approved briefing for future delivery.
 */
export const scheduleBriefingTool: McpToolDefinition = {
  name: "schedule_briefing",
  description:
    "Schedule an approved Research Briefing for automated future delivery (e.g. '+1h', '+30m', 'now', or ISO datetime string).",
  parameters: z.object({
    briefingId: z.string().describe("UUID of the research briefing"),
    time: z
      .string()
      .optional()
      .default("+1h")
      .describe("Send time offset (e.g. 'now', '+30m', '+1h', '+1d') or exact ISO datetime string"),
  }),
  execute: async ({ briefingId, time = "+1h" }) => {
    const briefing = await prisma.briefing.findUnique({
      where: { id: briefingId },
    });

    if (!briefing) {
      throw new Error(`Briefing not found with ID: ${briefingId}`);
    }

    let scheduledDate = new Date(Date.now() + 3600000);
    if (time === "now") {
      scheduledDate = new Date();
    } else if (time.startsWith("+")) {
      const num = parseInt(time.slice(1, -1), 10);
      const unit = time.slice(-1);
      if (unit === "m") {
        scheduledDate = new Date(Date.now() + num * 60000);
      } else if (unit === "h") {
        scheduledDate = new Date(Date.now() + num * 3600000);
      } else if (unit === "d") {
        scheduledDate = new Date(Date.now() + num * 86400000);
      }
    } else {
      scheduledDate = new Date(time);
    }

    const updated = await prisma.briefing.update({
      where: { id: briefingId },
      data: {
        status: "scheduled",
        scheduledAt: scheduledDate,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              briefingId: updated.id,
              title: updated.title,
              status: updated.status,
              scheduledAt: updated.scheduledAt?.toISOString(),
              scheduledAtLocal: updated.scheduledAt?.toLocaleString(),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 4. Dispatch due scheduled briefings in the queue.
 */
export const dispatchScheduledBriefingsTool: McpToolDefinition = {
  name: "dispatch_scheduled_briefings",
  description:
    "Evaluate the scheduled queue and execute delivery for all due briefings to Telegram with rate pacing.",
  parameters: z.object({
    chatIdOverride: z.string().optional().describe("Optional Telegram chat ID override"),
  }),
  execute: async ({ chatIdOverride }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || botToken.includes("123456789") || !targetChatId) {
      throw new Error("Valid TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required in environment variables.");
    }

    const scheduledBriefings = await prisma.briefing.findMany({
      where: { status: "scheduled" },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    const { due, upcoming } = evaluateScheduledQueue(scheduledBriefings, new Date());

    if (due.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "No scheduled briefings are currently due for delivery.",
              dueCount: 0,
              upcomingCount: upcoming.length,
            }),
          },
        ],
      };
    }

    const results = [];
    for (const b of due) {
      await prisma.briefing.update({
        where: { id: b.id },
        data: { status: "sending" },
      });

      const html = formatBriefingForTelegramHtml({
        title: b.title,
        issueNumber: b.issueNumber || undefined,
        contentType: b.contentType,
        status: "sending",
        target: b.target,
        sections: b.sections.map((s) => ({
          title: s.title,
          content: s.content,
          order: s.order,
          sectionType: s.sectionType as any,
          paperReferences: s.paperReferences,
        })),
      });

      const chunks = chunkTelegramMessage(html, targetChatId, 4096);
      const deliveryRes = await sendTelegramChunks(botToken, chunks, 1000);

      await prisma.deliveryLog.create({
        data: {
          briefingId: b.id,
          telegramChatId: targetChatId,
          status: "sent",
          sentAt: new Date(),
        },
      });

      const updated = await prisma.briefing.update({
        where: { id: b.id },
        data: { status: "sent", sentAt: new Date() },
      });

      results.push({
        briefingId: updated.id,
        title: updated.title,
        sentChunks: `${deliveryRes.successfulChunks}/${deliveryRes.totalChunks}`,
        sentAt: updated.sentAt?.toISOString(),
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Successfully dispatched ${results.length} due briefing(s) to Telegram`,
              dispatched: results,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 5. Send briefing immediately to Telegram.
 */
export const sendBriefingTool: McpToolDefinition = {
  name: "send_briefing",
  description:
    "Publish and dispatch a Research Briefing immediately to Telegram with 4096-char chunking and rate pacing.",
  parameters: z.object({
    briefingId: z.string().describe("UUID of the research briefing to publish"),
    chatId: z.string().optional().describe("Optional Telegram chat ID override"),
  }),
  execute: async ({ briefingId, chatId }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || botToken.includes("123456789") || !targetChatId) {
      throw new Error("Valid TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required in environment variables.");
    }

    const briefing = await prisma.briefing.findUnique({
      where: { id: briefingId },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    if (!briefing) {
      throw new Error(`Briefing not found with ID: ${briefingId}`);
    }

    await prisma.briefing.update({
      where: { id: briefingId },
      data: { status: "sending" },
    });

    const html = formatBriefingForTelegramHtml({
      title: briefing.title,
      issueNumber: briefing.issueNumber || undefined,
      contentType: briefing.contentType,
      status: "sending",
      target: briefing.target,
      sections: briefing.sections.map((s) => ({
        title: s.title,
        content: s.content,
        order: s.order,
        sectionType: s.sectionType as any,
        paperReferences: s.paperReferences,
      })),
    });

    const chunks = chunkTelegramMessage(html, targetChatId, 4096);
    const result = await sendTelegramChunks(botToken, chunks, 1000);

    await prisma.deliveryLog.create({
      data: {
        briefingId: briefing.id,
        telegramChatId: targetChatId,
        status: "sent",
        sentAt: new Date(),
      },
    });

    const updated = await prisma.briefing.update({
      where: { id: briefingId },
      data: { status: "sent", sentAt: new Date() },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Delivered briefing "${updated.title}" to Telegram`,
              briefingId: updated.id,
              targetChatId,
              successfulChunks: result.successfulChunks,
              totalChunks: result.totalChunks,
              status: updated.status,
              sentAt: updated.sentAt?.toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 6. Preview rendered Telegram HTML and chunk boundaries.
 */
export const previewBriefingTelegramTool: McpToolDefinition = {
  name: "preview_briefing_telegram",
  description:
    "Preview the rendered Telegram HTML format and 4096-character chunk boundaries of a research briefing without sending it.",
  parameters: z.object({
    briefingId: z.string().describe("UUID of the research briefing"),
  }),
  execute: async ({ briefingId }) => {
    const briefing = await prisma.briefing.findUnique({
      where: { id: briefingId },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    if (!briefing) {
      throw new Error(`Briefing not found with ID: ${briefingId}`);
    }

    const html = formatBriefingForTelegramHtml({
      title: briefing.title,
      issueNumber: briefing.issueNumber || undefined,
      contentType: briefing.contentType,
      status: briefing.status,
      target: briefing.target,
      sections: briefing.sections.map((s) => ({
        title: s.title,
        content: s.content,
        order: s.order,
        sectionType: s.sectionType as any,
        paperReferences: s.paperReferences,
      })),
    });

    const chunks = chunkTelegramMessage(html, "preview", 4096);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              briefingId: briefing.id,
              title: briefing.title,
              totalHtmlLength: html.length,
              chunksCount: chunks.length,
              chunks: chunks.map((c, idx) => ({
                chunkIndex: idx + 1,
                length: c.text.length,
                preview: c.text.slice(0, 200) + (c.text.length > 200 ? "..." : ""),
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

/**
 * 7. List research briefings.
 */
export const listBriefingsTool: McpToolDefinition = {
  name: "list_briefings",
  description: "List research briefings from the database with optional status filtering.",
  parameters: z.object({
    status: z
      .enum(["draft", "in_review", "changes_requested", "approved", "scheduled", "sending", "sent", "failed"])
      .optional()
      .describe("Filter briefings by review status"),
  }),
  execute: async ({ status }) => {
    const where = status ? { status } : {};
    const briefings = await prisma.briefing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sections: {
          select: { id: true, title: true, order: true, sectionType: true },
          orderBy: { order: "asc" },
        },
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            briefings.map((b) => ({
              id: b.id,
              issueNumber: b.issueNumber,
              title: b.title,
              status: b.status,
              target: b.target,
              scheduledAt: b.scheduledAt,
              sentAt: b.sentAt,
              sectionsCount: b.sections.length,
              sections: b.sections,
            })),
            null,
            2
          ),
        },
      ],
    };
  },
};

export const briefingTools: McpToolDefinition[] = [
  draftBriefingTool,
  transitionBriefingStatusTool,
  scheduleBriefingTool,
  dispatchScheduledBriefingsTool,
  sendBriefingTool,
  previewBriefingTelegramTool,
  listBriefingsTool,
];
