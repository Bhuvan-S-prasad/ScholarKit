import { Command } from "commander";
import { createBriefingCommand } from "./briefing.js";

export function createNewsletterCommand(): Command {
  const cmd = createBriefingCommand();
  cmd.name("newsletter").description("Legacy alias for 'briefing' operator");
  return cmd;
}
