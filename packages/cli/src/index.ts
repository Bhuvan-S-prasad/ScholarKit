#!/usr/bin/env bun
import { Command } from "commander";
import { createPaperCommand } from "./commands/paper.js";
import { createReviewCommand } from "./commands/review.js";
import { createBriefingCommand } from "./commands/briefing.js";
import { createNewsletterCommand } from "./commands/newsletter.js";
import { colors } from "./utils/output.js";

const program = new Command();

program
  .name("scholarkit")
  .description(`${colors.bold}${colors.cyan}ScholarKit${colors.reset} — Research Paper Analyst, Literature Review Manager & Research Briefing Operator`)
  .version("0.1.0");

// Register Subcommands
program.addCommand(createPaperCommand());
program.addCommand(createReviewCommand());
program.addCommand(createBriefingCommand());
program.addCommand(createNewsletterCommand());

// Interactive Dashboard Command
program
  .command("tui")
  .description("Launch the interactive terminal dashboard (lazygit / k9s style)")
  .option("-t, --tab <tab>", "Initial tab to open: papers | reviews | briefings | newsletters", "papers")
  .option("--dev", "Enable developer testing hotkeys (such as offline stub extraction)")
  .action(async (options: { tab?: "papers" | "reviews" | "briefings" | "newsletters"; dev?: boolean }) => {
    const { launchTui } = await import("./ui/index.js");
    await launchTui({ initialTab: options.tab });
  });

// Launch TUI by default when no arguments are passed
if (!process.argv.slice(2).length) {
  const { launchTui } = await import("./ui/index.js");
  await launchTui();
} else {
  program.parse(process.argv);
}
