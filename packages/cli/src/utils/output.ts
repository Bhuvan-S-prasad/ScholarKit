// ANSI terminal formatting helpers with full NO_COLOR, TERM=dumb, and --plain accessibility compliance

export function isColorDisabled(): boolean {
  return Boolean(
    process.env.NO_COLOR ||
      process.env.TERM === "dumb" ||
      process.argv.includes("--plain") ||
      !process.stdout.isTTY
  );
}

export function isPlainMode(): boolean {
  return Boolean(
    process.argv.includes("--plain") ||
      process.env.TERM === "dumb" ||
      !process.stdout.isTTY
  );
}

export function isJsonMode(): boolean {
  return process.argv.includes("--json");
}

export const colors = {
  get reset() {
    return isColorDisabled() ? "" : "\x1b[0m";
  },
  get bold() {
    return isColorDisabled() ? "" : "\x1b[1m";
  },
  get dim() {
    return isColorDisabled() ? "" : "\x1b[2m";
  },
  get italic() {
    return isColorDisabled() ? "" : "\x1b[3m";
  },
  get underline() {
    return isColorDisabled() ? "" : "\x1b[4m";
  },
  // 16 ANSI Standard Colors
  get cyan() {
    return isColorDisabled() ? "" : "\x1b[36m";
  },
  get green() {
    return isColorDisabled() ? "" : "\x1b[32m";
  },
  get yellow() {
    return isColorDisabled() ? "" : "\x1b[33m";
  },
  get red() {
    return isColorDisabled() ? "" : "\x1b[31m";
  },
  get magenta() {
    return isColorDisabled() ? "" : "\x1b[35m";
  },
  get blue() {
    return isColorDisabled() ? "" : "\x1b[34m";
  },
  get gray() {
    return isColorDisabled() ? "" : "\x1b[90m";
  },
  get white() {
    return isColorDisabled() ? "" : "\x1b[37m";
  },
};

export function banner(title: string, subtitle?: string): void {
  if (isPlainMode() || isJsonMode()) return;
  console.log(`\n${colors.bold}${colors.cyan}=== ScholarKit ===${colors.reset}`);
  console.log(`${colors.bold}${title}${colors.reset}`);
  if (subtitle) {
    console.log(`${colors.dim}${subtitle}${colors.reset}`);
  }
  console.log("");
}

export function section(title: string): void {
  if (isPlainMode() || isJsonMode()) {
    console.log(`\n--- ${title} ---`);
    return;
  }
  console.log(`\n${colors.bold}${colors.cyan}▶ ${title}${colors.reset}`);
}

export function success(msg: string): void {
  if (isJsonMode()) return;
  if (isPlainMode()) {
    console.log(`SUCCESS: ${msg}`);
    return;
  }
  console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}

export function info(msg: string): void {
  if (isJsonMode()) return;
  if (isPlainMode()) {
    console.log(`INFO: ${msg}`);
    return;
  }
  console.log(`${colors.blue}ℹ ${msg}${colors.reset}`);
}

export function warn(msg: string): void {
  if (isJsonMode()) return;
  if (isPlainMode()) {
    console.log(`WARN: ${msg}`);
    return;
  }
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

export function error(msg: string): void {
  if (isJsonMode()) {
    console.error(JSON.stringify({ error: msg }));
    return;
  }
  if (isPlainMode()) {
    console.error(`ERROR: ${msg}`);
    return;
  }
  console.error(`${colors.red}✖ ${msg}${colors.reset}`);
}

export function confidenceBadge(score: number): string {
  const percent = (score * 100).toFixed(0);
  if (score >= 0.8) {
    return `[HIGH CONFIDENCE ${percent}%]`;
  } else if (score >= 0.6) {
    return `[MODERATE CONFIDENCE ${percent}%]`;
  } else {
    return `[LOW CONFIDENCE ${percent}% (REVIEW REQUIRED)]`;
  }
}

export function renderJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
