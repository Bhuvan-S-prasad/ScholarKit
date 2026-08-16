import { Command } from "commander";
import {
  createBriefingDraft,
  transitionReviewStatus,
  getAvailableWorkflowActions,
  formatBriefingForTelegramHtml,
  chunkTelegramMessage,
  sendTelegramChunks,
  WorkflowAction,
  ReviewStatus,
  DeliveryTarget,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { banner, section, success, info, warn, error, colors } from "../utils/output.js";

export function createBriefingCommand(): Command {
  const briefingCmd = new Command("briefing").description(
    "Research Briefing Operator & Telegram Publishing (draft, review state machine, preview, schedule, and send)"
  );

  // --------------------------------------------------------------------------
  // 1. Create Briefing Draft
  // --------------------------------------------------------------------------
  briefingCmd
    .command("draft <title>")
    .description("Draft a new research briefing from recent papers or literature reviews")
    .option("-p, --papers <paperIds...>", "Specific paper IDs or arXiv IDs to include")
    .option("-t, --target <target>", "Delivery target: telegram_channel | telegram_dm | telegram_group", "telegram_channel")
    .action(async (title: string, options: { papers?: string[]; target: string }) => {
      try {
        banner("ScholarKit Research Briefing Draft Builder");

        let papersToInclude: Array<{ id: string; title: string; sourceId: string; abstract: string; keyFindings?: string[]; methodology?: any }> = [];

        if (options.papers && options.papers.length > 0) {
          const found = await prisma.paper.findMany({
            where: {
              OR: [{ id: { in: options.papers } }, { sourceId: { in: options.papers } }],
            },
            include: { extraction: true },
          });
          papersToInclude = found.map((p) => ({
            id: p.id,
            title: p.title,
            sourceId: p.sourceId,
            abstract: p.abstract,
            keyFindings: p.extraction?.keyFindings,
            methodology: p.extraction?.methodology,
          }));
        } else {
          const recent = await prisma.paper.findMany({
            take: 3,
            orderBy: { createdAt: "desc" },
            include: { extraction: true },
          });
          papersToInclude = recent.map((p) => ({
            id: p.id,
            title: p.title,
            sourceId: p.sourceId,
            abstract: p.abstract,
            keyFindings: p.extraction?.keyFindings,
            methodology: p.extraction?.methodology,
          }));
        }

        const count = await prisma.briefing.count();
        const issueNumber = count + 1;

        type SectionType = "intro" | "deep_dive" | "quick_takes" | "outro" | "custom";
        const sectionsData: Array<{
          title: string;
          content: string;
          order: number;
          sectionType: SectionType;
          paperReferences: string[];
        }> = [
          {
            title: "Executive Synthesis & Thematic Overview",
            content: `Welcome to this edition of ScholarKit Research Briefing! Today we highlight breakthrough developments in automated intelligence and computational efficiency.`,
            order: 1,
            sectionType: "intro",
            paperReferences: [],
          },
        ];

        let orderIdx = 2;
        for (const p of papersToInclude) {
          const findingsText = p.keyFindings && p.keyFindings.length > 0
            ? p.keyFindings.map((f) => `• ${f}`).join("\n")
            : p.abstract;

          sectionsData.push({
            title: `Deep Dive: ${p.title}`,
            content: findingsText,
            order: orderIdx++,
            sectionType: "deep_dive" as const,
            paperReferences: [p.sourceId],
          });
        }

        sectionsData.push({
          title: "Looking Ahead & Research Horizons",
          content: "Subscribe to stay ahead of fast-moving systems engineering and autonomous intelligence literature.",
          order: orderIdx,
          sectionType: "outro",
          paperReferences: [],
        });

        // Validate via pure core operation
        const briefingDraft = createBriefingDraft(title, sectionsData as any, {
          issueNumber,
          target: options.target as DeliveryTarget,
        });

        const created = await prisma.briefing.create({
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

        success(`Created Research Briefing issue #${created.issueNumber} (ID: ${created.id})`);
        info(`Initial Status: ${colors.bold}${created.status}${colors.reset} (Review Workflow Ready)`);
        info(`Delivery Target: ${created.target}`);
        info(`Total Sections: ${created.sections.length}`);
      } catch (err) {
        error(`Failed to draft research briefing: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // --------------------------------------------------------------------------
  // 2. List Briefings
  // --------------------------------------------------------------------------
  briefingCmd
    .command("list")
    .description("List all research briefings and their editorial workflow states")
    .option("-s, --status <status>", "Filter by status: draft | in_review | approved | scheduled | sending | sent | failed")
    .option("--json", "Output structured JSON")
    .action(async (options: { status?: string; json?: boolean }) => {
      try {
        const whereClause = options.status ? { status: options.status as ReviewStatus } : {};
        const briefings = await prisma.briefing.findMany({
          where: whereClause,
          include: { sections: { orderBy: { order: "asc" } } },
          orderBy: { createdAt: "desc" },
        });

        if (options.json) {
          console.log(JSON.stringify(briefings, null, 2));
          return;
        }

        banner("ScholarKit Research Briefings Pipeline");

        if (briefings.length === 0) {
          info("No research briefings found matching query.");
          return;
        }

        for (const b of briefings) {
          section(`#${b.issueNumber || "—"} ${b.title} [${b.status.toUpperCase()}]`);
          console.log(`  ${colors.dim}ID:${colors.reset}        ${b.id}`);
          console.log(`  ${colors.dim}Target:${colors.reset}    ${b.target}`);
          console.log(`  ${colors.dim}Sections:${colors.reset}  ${b.sections.length}`);
          if (b.scheduledAt) console.log(`  ${colors.dim}Scheduled:${colors.reset} ${b.scheduledAt.toISOString()}`);
          if (b.sentAt) console.log(`  ${colors.dim}Sent At:${colors.reset}   ${b.sentAt.toISOString()}`);
          console.log("");
        }
      } catch (err) {
        error(`Failed to list briefings: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // --------------------------------------------------------------------------
  // 3. Transition Workflow State
  // --------------------------------------------------------------------------
  briefingCmd
    .command("transition <briefingId> <action>")
    .description(
      "Advance review state machine (submit_for_review | approve | request_changes | schedule | start_sending | mark_sent | mark_failed | retry)"
    )
    .action(async (briefingId: string, action: string) => {
      try {
        const briefing = await prisma.briefing.findUnique({
          where: { id: briefingId },
        });

        if (!briefing) {
          error(`Briefing not found with ID: ${briefingId}`);
          process.exit(1);
        }

        const validAction = action as WorkflowAction;
        const currentStatus = briefing.status as ReviewStatus;
        const nextStatus = transitionReviewStatus(currentStatus, validAction);

        const updated = await prisma.briefing.update({
          where: { id: briefingId },
          data: {
            status: nextStatus,
            scheduledAt: nextStatus === "scheduled" ? new Date(Date.now() + 3600000) : briefing.scheduledAt,
            sentAt: nextStatus === "sent" ? new Date() : briefing.sentAt,
          },
        });

        success(`Transitioned briefing "${briefing.title}"`);
        info(`Workflow Path: ${colors.bold}${currentStatus}${colors.reset} ──[${action}]──▶ ${colors.bold}${nextStatus}${colors.reset}`);
        const availableNext = getAvailableWorkflowActions(updated.status as ReviewStatus);
        info(`Available Next Actions: ${availableNext.join(" | ") || "None (Terminal state)"}`);
      } catch (err) {
        error(`Transition failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // --------------------------------------------------------------------------
  // 4. Preview Briefing (Telegram HTML formatting & chunk inspection)
  // --------------------------------------------------------------------------
  briefingCmd
    .command("preview <briefingId>")
    .description("Preview Telegram HTML formatting and 4096-character chunk boundaries")
    .action(async (briefingId: string) => {
      try {
        const briefing = await prisma.briefing.findUnique({
          where: { id: briefingId },
          include: { sections: { orderBy: { order: "asc" } } },
        });

        if (!briefing) {
          error(`Briefing not found with ID: ${briefingId}`);
          process.exit(1);
        }

        banner(`Telegram Preview: #${briefing.issueNumber || "—"} ${briefing.title}`);

        const fullHtml = formatBriefingForTelegramHtml({
          title: briefing.title,
          issueNumber: briefing.issueNumber || undefined,
          contentType: briefing.contentType as any,
          status: briefing.status as any,
          target: briefing.target as any,
          sections: briefing.sections.map((s) => ({
            title: s.title,
            content: s.content,
            order: s.order,
            sectionType: s.sectionType as any,
            paperReferences: s.paperReferences,
          })),
        });

        const chunks = chunkTelegramMessage(fullHtml, "preview-chat", 4096);

        info(`Total Rendered Length: ${fullHtml.length} characters`);
        info(`Calculated Telegram Chunks: ${chunks.length} (Limit: 4096 chars/chunk)`);
        console.log("");

        chunks.forEach((chunk, i) => {
          section(`Chunk [${i + 1}/${chunks.length}] (${chunk.text.length} chars)`);
          console.log(chunk.text);
          console.log("");
        });
      } catch (err) {
        error(`Failed to preview briefing: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // --------------------------------------------------------------------------
  // 5. Send Briefing to Telegram
  // --------------------------------------------------------------------------
  briefingCmd
    .command("send <briefingId>")
    .description("Send research briefing to Telegram channel or chat")
    .option("-c, --chat-id <chatId>", "Explicit Telegram Chat ID (defaults to TELEGRAM_CHAT_ID from .env)")
    .action(async (briefingId: string, options: { chatId?: string }) => {
      try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const targetChatId = options.chatId || process.env.TELEGRAM_CHAT_ID;

        if (!botToken || botToken.includes("123456789")) {
          error("Valid TELEGRAM_BOT_TOKEN not found in .env.");
          process.exit(1);
        }

        if (!targetChatId) {
          error("Target chat ID required. Pass --chat-id or set TELEGRAM_CHAT_ID in .env.");
          process.exit(1);
        }

        const briefing = await prisma.briefing.findUnique({
          where: { id: briefingId },
          include: { sections: { orderBy: { order: "asc" } } },
        });

        if (!briefing) {
          error(`Briefing not found with ID: ${briefingId}`);
          process.exit(1);
        }

        banner(`Publishing Briefing #${briefing.issueNumber || "—"} to Telegram`);

        await prisma.briefing.update({
          where: { id: briefingId },
          data: { status: "sending" },
        });

        const fullHtml = formatBriefingForTelegramHtml({
          title: briefing.title,
          issueNumber: briefing.issueNumber || undefined,
          contentType: briefing.contentType as any,
          status: "sending",
          target: briefing.target as any,
          sections: briefing.sections.map((s) => ({
            title: s.title,
            content: s.content,
            order: s.order,
            sectionType: s.sectionType as any,
            paperReferences: s.paperReferences,
          })),
        });

        const chunks = chunkTelegramMessage(fullHtml, targetChatId, 4096);
        info(`Dispatching ${chunks.length} rate-paced chunk(s) to chat ${targetChatId}...`);

        try {
          const result = await sendTelegramChunks(botToken, chunks, 1000);

          await prisma.deliveryLog.create({
            data: {
              briefingId: briefing.id,
              telegramChatId: targetChatId,
              status: "sent",
              sentAt: new Date(),
            },
          });

          await prisma.briefing.update({
            where: { id: briefingId },
            data: {
              status: "sent",
              sentAt: new Date(),
            },
          });

          success(`Successfully delivered ${result.successfulChunks}/${result.totalChunks} chunks to Telegram!`);
          info(`Briefing state marked as: ${colors.bold}sent${colors.reset}`);
        } catch (dispatchErr) {
          await prisma.deliveryLog.create({
            data: {
              briefingId: briefing.id,
              telegramChatId: targetChatId,
              status: "failed",
              errorMessage: (dispatchErr as Error).message,
            },
          });

          await prisma.briefing.update({
            where: { id: briefingId },
            data: { status: "failed" },
          });

          throw dispatchErr;
        }
      } catch (err) {
        error(`Failed to send briefing: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // --------------------------------------------------------------------------
  // 6. Schedule Briefing
  // --------------------------------------------------------------------------
  briefingCmd
    .command("schedule <briefingId> [time]")
    .description("Schedule an approved research briefing for future delivery (e.g. '+1h', '+30m', 'now', or ISO datetime)")
    .action(async (briefingId: string, time?: string) => {
      try {
        const briefing = await prisma.briefing.findUnique({
          where: { id: briefingId },
        });

        if (!briefing) {
          error(`Briefing not found with ID: ${briefingId}`);
          process.exit(1);
        }

        if (briefing.status !== "approved" && briefing.status !== "draft" && briefing.status !== "in_review") {
          warn(`Briefing is in status "${briefing.status}". Setting to scheduled.`);
        }

        let scheduledDate = new Date(Date.now() + 3600000); // default +1h
        if (time) {
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
        }

        const updated = await prisma.briefing.update({
          where: { id: briefingId },
          data: {
            status: "scheduled",
            scheduledAt: scheduledDate,
          },
        });

        success(`Scheduled Briefing #${updated.issueNumber || "—"} "${updated.title}"`);
        info(`Scheduled Send Time: ${colors.bold}${scheduledDate.toISOString()}${colors.reset} (${scheduledDate.toLocaleString()})`);
        info(`Queue status: Ready for scheduler worker execution.`);
      } catch (err) {
        error(`Failed to schedule briefing: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // --------------------------------------------------------------------------
  // 7. Scheduler Worker
  // --------------------------------------------------------------------------
  briefingCmd
    .command("worker")
    .description("Execute worker to process and dispatch due scheduled research briefings to Telegram (cron-friendly)")
    .option("--run-once", "Execute one poll sweep and terminate (standard cron mode)", true)
    .action(async () => {
      try {
        const { evaluateScheduledQueue } = await import("@scholarkit/core");
        banner("ScholarKit Briefing Scheduler Queue Worker");

        const scheduledBriefings = await prisma.briefing.findMany({
          where: { status: "scheduled" },
          include: { sections: { orderBy: { order: "asc" } } },
        });

        const now = new Date();
        const { due, upcoming } = evaluateScheduledQueue(scheduledBriefings, now);

        info(`Queue Sweep at ${now.toISOString()}: Found ${due.length} due briefing(s), ${upcoming.length} upcoming.`);

        if (due.length === 0) {
          info("No scheduled briefings are due for dispatch. Exiting cleanly.");
          return;
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const targetChatId = process.env.TELEGRAM_CHAT_ID;

        if (!botToken || botToken.includes("123456789") || !targetChatId) {
          error("Valid TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required to dispatch due queue.");
          process.exit(1);
        }

        for (const b of due) {
          info(`Processing due briefing #${b.issueNumber || "—"} "${b.title}"...`);

          await prisma.briefing.update({
            where: { id: b.id },
            data: { status: "sending" },
          });

          const fullHtml = formatBriefingForTelegramHtml({
            title: b.title,
            issueNumber: b.issueNumber || undefined,
            contentType: b.contentType as any,
            status: "sending",
            target: b.target as any,
            sections: b.sections.map((s) => ({
              title: s.title,
              content: s.content,
              order: s.order,
              sectionType: s.sectionType as any,
              paperReferences: s.paperReferences,
            })),
          });

          const chunks = chunkTelegramMessage(fullHtml, targetChatId, 4096);
          await sendTelegramChunks(botToken, chunks, 1000);

          await prisma.deliveryLog.create({
            data: {
              briefingId: b.id,
              telegramChatId: targetChatId,
              status: "sent",
              sentAt: new Date(),
            },
          });

          await prisma.briefing.update({
            where: { id: b.id },
            data: { status: "sent", sentAt: new Date() },
          });

          success(`Dispatched briefing "${b.title}" to Telegram chat ${targetChatId}`);
        }
      } catch (err) {
        error(`Worker encountered fatal error: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  return briefingCmd;
}

// Backwards-compatible alias
export const createNewsletterCommand = createBriefingCommand;
