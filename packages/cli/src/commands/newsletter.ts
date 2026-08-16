import { Command } from "commander";
import {
  createNewsletterDraft,
  transitionReviewStatus,
  getAvailableWorkflowActions,
  formatNewsletterForTelegramHtml,
  chunkTelegramMessage,
  sendTelegramChunks,
  createDeliveryLog,
  WorkflowAction,
  ReviewStatus,
  DeliveryTarget,
} from "@scholarkit/core";
import { prisma } from "@scholarkit/db";
import { banner, section, success, info, warn, error, colors } from "../utils/output.js";

export function createNewsletterCommand(): Command {
  const newsletterCmd = new Command("newsletter").description(
    "Newsletter Operator & Telegram Publishing (draft, review state machine, preview, and send)"
  );

  // --------------------------------------------------------------------------
  // 1. Create Newsletter Draft
  // --------------------------------------------------------------------------
  newsletterCmd
    .command("draft <title>")
    .description("Draft a new research newsletter from recent papers or reviews")
    .option("-p, --papers <paperIds...>", "Specific paper IDs or arXiv IDs to include")
    .option("-t, --target <target>", "Delivery target: telegram_channel | telegram_dm | telegram_group", "telegram_channel")
    .action(async (title: string, options: { papers?: string[]; target: string }) => {
      try {
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
          // Fetch up to 3 recent papers
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

        // Build sections
        type SectionType = "intro" | "deep_dive" | "quick_take" | "methodology_spotlight" | "outro" | "custom";
        const sectionsData: Array<{
          title: string;
          content: string;
          order: number;
          sectionType: SectionType;
          paperReferences: string[];
        }> = [
          {
            title: "Executive Overview",
            content: `Welcome to this edition of ScholarKit Research Digest! Today we highlight breakthrough developments in automated intelligence and computational efficiency.`,
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
          title: "Looking Ahead",
          content: "Subscribe to stay ahead of fast-moving machine learning and systems research.",
          order: orderIdx,
          sectionType: "outro" as const,
          paperReferences: [],
        });

        // Persist Newsletter in Neon DB
        const count = await prisma.newsletter.count();
        const issueNumber = count + 1;

        const newsletter = await prisma.newsletter.create({
          data: {
            title,
            issueNumber,
            status: "draft",
            target: (options.target as DeliveryTarget) || "telegram_channel",
            sections: {
              create: sectionsData.map((s) => ({
                title: s.title,
                content: s.content,
                order: s.order,
                sectionType: s.sectionType,
                paperReferences: s.paperReferences,
              })),
            },
          },
          include: { sections: true },
        });

        banner("Newsletter Draft Created", `Issue #${issueNumber} | ID: ${newsletter.id}`);
        console.log(`${colors.bold}Title:${colors.reset}       ${newsletter.title}`);
        console.log(`${colors.bold}Status:${colors.reset}      ${colors.yellow}${newsletter.status}${colors.reset}`);
        console.log(`${colors.bold}Sections:${colors.reset}    ${newsletter.sections.length}`);
        console.log(`${colors.bold}Target:${colors.reset}      ${newsletter.target}`);

        section("Included Sections");
        for (const sec of newsletter.sections) {
          console.log(`• [${sec.order}] ${sec.title} (${sec.sectionType})`);
        }

        const nextActions = getAvailableWorkflowActions("draft");
        info(`Next Workflow Action: Run 'scholarkit newsletter transition ${newsletter.id} ${nextActions[0]}' to submit for review.`);
      } catch (err) {
        error(`Failed to create newsletter: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 2. List Newsletters
  // --------------------------------------------------------------------------
  newsletterCmd
    .command("list")
    .description("List all newsletters and their review workflow states")
    .option("--json", "Output newsletters as raw JSON")
    .option("--plain", "Output plain linear text without ANSI formatting")
    .action(async (options: { json?: boolean; plain?: boolean }) => {
      try {
        const newsletters = await prisma.newsletter.findMany({
          orderBy: { createdAt: "desc" },
          include: { sections: true },
        });

        if (options.json) {
          console.log(JSON.stringify(newsletters, null, 2));
          return;
        }

        if (newsletters.length === 0) {
          info("No newsletters found. Create your first draft with 'scholarkit newsletter draft \"Title\"'.");
          return;
        }

        if (options.plain) {
          console.log(`TOTAL NEWSLETTERS: ${newsletters.length}`);
          for (const n of newsletters) {
            console.log(`[${n.id}] #${n.issueNumber || "—"} ${n.title} | Status: [${n.status.toUpperCase()}] | Sections: ${n.sections.length} | Target: ${n.target}`);
          }
          return;
        }

        banner(`Newsletters (${newsletters.length})`);
        for (const n of newsletters) {
          const statusColor =
            n.status === "sent"
              ? colors.green
              : n.status === "approved" || n.status === "scheduled"
                ? colors.cyan
                : n.status === "failed"
                  ? colors.red
                  : colors.yellow;

          console.log(`${colors.bold}• [${n.id}]${colors.reset} #${n.issueNumber || "—"} ${n.title} ${statusColor}[${n.status}]${colors.reset}`);
          console.log(`  ${colors.dim}Sections: ${n.sections.length} | Target: ${n.target} | Updated: ${n.updatedAt.toISOString().split("T")[0]}${colors.reset}`);
        }
      } catch (err) {
        error(`Failed to list newsletters: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 3. Workflow State Machine Transition
  // --------------------------------------------------------------------------
  newsletterCmd
    .command("transition <newsletterId> <action>")
    .description(
      "Advance review state machine (submit_for_review | approve | request_changes | schedule | start_sending | mark_sent | mark_failed | retry)"
    )
    .action(async (newsletterId: string, action: string) => {
      try {
        const newsletter = await prisma.newsletter.findUnique({
          where: { id: newsletterId },
        });

        if (!newsletter) {
          error(`Newsletter "${newsletterId}" not found.`);
          process.exitCode = 1;
          return;
        }

        const validAction = action as WorkflowAction;
        const currentStatus = newsletter.status as ReviewStatus;

        // Execute pure state transition validation from @scholarkit/core
        const nextStatus = transitionReviewStatus(currentStatus, validAction);

        // Update database
        const updated = await prisma.newsletter.update({
          where: { id: newsletter.id },
          data: {
            status: nextStatus,
            scheduledAt: nextStatus === "scheduled" ? new Date(Date.now() + 3600000) : newsletter.scheduledAt,
            sentAt: nextStatus === "sent" ? new Date() : newsletter.sentAt,
          },
        });

        banner("Review Workflow State Transition", newsletter.title);
        console.log(`State change: ${colors.yellow}${currentStatus}${colors.reset} ──(${colors.bold}${action}${colors.reset})──▶ ${colors.green}${nextStatus}${colors.reset}`);

        const nextActions = getAvailableWorkflowActions(nextStatus);
        if (nextActions.length > 0) {
          info(`Available Next Actions: ${nextActions.map((a) => `'${a}'`).join(", ")}`);
        } else {
          success("Terminal state reached. Newsletter workflow completed.");
        }
      } catch (err) {
        error(`Transition failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 4. Preview Telegram Formatted HTML & Chunks
  // --------------------------------------------------------------------------
  newsletterCmd
    .command("preview <newsletterId>")
    .description("Preview Telegram HTML formatting and 4096-character chunk boundaries")
    .action(async (newsletterId: string) => {
      try {
        const newsletter = await prisma.newsletter.findUnique({
          where: { id: newsletterId },
          include: { sections: { orderBy: { order: "asc" } } },
        });

        if (!newsletter) {
          error(`Newsletter "${newsletterId}" not found.`);
          process.exitCode = 1;
          return;
        }

        const html = formatNewsletterForTelegramHtml({
          title: newsletter.title,
          issueNumber: newsletter.issueNumber || undefined,
          contentType: newsletter.contentType,
          status: newsletter.status,
          target: newsletter.target,
          sections: newsletter.sections.map((s) => ({
            title: s.title,
            content: s.content,
            order: s.order,
            sectionType: s.sectionType as any,
            paperReferences: s.paperReferences,
          })),
        });

        const chunks = chunkTelegramMessage(html, "preview", 4096);

        banner("Telegram Message Preview", `${newsletter.title} (Total Chunks: ${chunks.length})`);
        console.log(`Total Characters: ${html.length} | Chunk Limit: 4096 chars\n`);

        for (const chunk of chunks) {
          section(`Chunk [${chunk.chunkIndex + 1}/${chunk.totalChunks}] (${chunk.text.length} chars)`);
          console.log(chunk.text);
          console.log(`${colors.dim}--------------------------------------------------${colors.reset}`);
        }
      } catch (err) {
        error(`Failed to preview newsletter: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // --------------------------------------------------------------------------
  // 5. Send Newsletter via Telegram
  // --------------------------------------------------------------------------
  newsletterCmd
    .command("send <newsletterId>")
    .description("Send newsletter digest to Telegram chat or channel")
    .option("-c, --chat-id <chatId>", "Telegram Chat ID or Channel Username (e.g. @mychannel or -1001234567)")
    .action(async (newsletterId: string, options: { chatId?: string }) => {
      try {
        const newsletter = await prisma.newsletter.findUnique({
          where: { id: newsletterId },
          include: { sections: { orderBy: { order: "asc" } } },
        });

        if (!newsletter) {
          error(`Newsletter "${newsletterId}" not found.`);
          process.exitCode = 1;
          return;
        }

        // Validate approval state
        if (newsletter.status !== "approved" && newsletter.status !== "scheduled" && newsletter.status !== "sending") {
          warn(
            `Newsletter is currently in '${newsletter.status}' state. It must be transitioned to 'approved' before dispatch.`
          );
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || botToken.includes("123456789")) {
          error("Valid TELEGRAM_BOT_TOKEN not found in environment. Please add your Telegram Bot token to .env.");
          process.exitCode = 1;
          return;
        }

        const targetChatId = options.chatId || (process.env.TELEGRAM_CHAT_ID as string);
        if (!targetChatId) {
          error("Target chat ID required. Pass --chat-id <id> or set TELEGRAM_CHAT_ID in .env.");
          process.exitCode = 1;
          return;
        }

        banner("Dispatching Telegram Newsletter", `${newsletter.title} ──▶ ${targetChatId}`);

        // Format and chunk
        const html = formatNewsletterForTelegramHtml({
          title: newsletter.title,
          issueNumber: newsletter.issueNumber || undefined,
          contentType: newsletter.contentType,
          status: newsletter.status,
          target: newsletter.target,
          sections: newsletter.sections.map((s) => ({
            title: s.title,
            content: s.content,
            order: s.order,
            sectionType: s.sectionType as any,
            paperReferences: s.paperReferences,
          })),
        });

        const chunks = chunkTelegramMessage(html, targetChatId, 4096);
        info(`Dispatching ${chunks.length} message chunk(s) to ${targetChatId} with 1-second rate pacing...`);

        // Mark as sending
        await prisma.newsletter.update({
          where: { id: newsletter.id },
          data: { status: "sending" },
        });

        const result = await sendTelegramChunks(botToken, chunks, 1000);

        // Record Delivery Log
        await prisma.deliveryLog.create({
          data: {
            newsletterId: newsletter.id,
            telegramChatId: targetChatId,
            status: "sent",
            sentAt: new Date(),
          },
        });

        // Mark as sent
        await prisma.newsletter.update({
          where: { id: newsletter.id },
          data: {
            status: "sent",
            sentAt: new Date(),
          },
        });

        success(`Newsletter sent successfully! (${result.successfulChunks}/${result.totalChunks} chunks delivered)`);
      } catch (err) {
        error(`Failed to send newsletter: ${(err as Error).message}`);
        // Log failure
        await prisma.deliveryLog.create({
          data: {
            newsletterId: newsletterId,
            telegramChatId: options.chatId || "unknown",
            status: "failed",
            errorMessage: (err as Error).message,
          },
        });
        await prisma.newsletter.update({
          where: { id: newsletterId },
          data: { status: "failed" },
        });
        process.exitCode = 1;
      }
    });

  return newsletterCmd;
}
