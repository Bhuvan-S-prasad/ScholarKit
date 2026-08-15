// Simple ANSI terminal formatting helpers (no external styling dependencies needed)

export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  // Colors
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  // Backgrounds
  bgCyan: "\x1b[46m\x1b[30m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m",
  bgRed: "\x1b[41m\x1b[37m",
};

export function banner(title: string, subtitle?: string): void {
  console.log(`\n${colors.bold}${colors.cyan}=== ScholarKit ===${colors.reset}`);
  console.log(`${colors.bold}${title}${colors.reset}`);
  if (subtitle) {
    console.log(`${colors.dim}${subtitle}${colors.reset}`);
  }
  console.log("");
}

export function section(title: string): void {
  console.log(`\n${colors.bold}${colors.cyan}▶ ${title}${colors.reset}`);
}

export function success(msg: string): void {
  console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}

export function info(msg: string): void {
  console.log(`${colors.blue}ℹ ${msg}${colors.reset}`);
}

export function warn(msg: string): void {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

export function error(msg: string): void {
  console.error(`${colors.red}✖ ${msg}${colors.reset}`);
}

export function confidenceBadge(score: number): string {
  const percent = (score * 100).toFixed(0);
  if (score >= 0.8) {
    return `${colors.bgGreen} ${percent}% High Confidence ${colors.reset}`;
  } else if (score >= 0.6) {
    return `${colors.bgYellow} ${percent}% Moderate Confidence ${colors.reset}`;
  } else {
    return `${colors.bgRed} ${percent}% Low Confidence (Review Required) ${colors.reset}`;
  }
}
