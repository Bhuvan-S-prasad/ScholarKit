#!/usr/bin/env bun
import { Command } from "commander";
import { createPaperCommand } from "./commands/paper.js";
import { colors } from "./utils/output.js";

const program = new Command();

program
  .name("scholarkit")
  .description(`${colors.bold}${colors.cyan}ScholarKit${colors.reset} — Research Paper Analyst, Literature Review Manager & Newsletter Operator`)
  .version("0.1.0");

// Register Subcommands
program.addCommand(createPaperCommand());

// Top-level help banner
if (!process.argv.slice(2).length) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
