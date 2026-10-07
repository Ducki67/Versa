const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  brightRed: "\x1b[91m",
  green: "\x1b[32m",
  brightGreen: "\x1b[92m",
  yellow: "\x1b[33m",
  brightYellow: "\x1b[93m",
  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",
  magenta: "\x1b[35m",
  brightMagenta: "\x1b[95m",
  white: "\x1b[37m",
};

function ts(): string {
  const d = new Date();
  return `${c.dim}${d.toISOString().slice(11, 19)}${c.reset}`;
}

function methodBadge(m: string): string {
  const p = m.padEnd(6);
  if (m === "GET") return `${c.brightGreen}${c.bold}${p}${c.reset}`;
  if (m === "POST") return `${c.brightCyan}${c.bold}${p}${c.reset}`;
  if (m === "PUT" || m === "PATCH") return `${c.brightYellow}${c.bold}${p}${c.reset}`;
  if (m === "DELETE") return `${c.brightRed}${c.bold}${p}${c.reset}`;
  return `${c.white}${c.bold}${p}${c.reset}`;
}

function statusBadge(s: number): string {
  const t = `${c.bold}${s}${c.reset}`;
  if (s >= 500) return `${c.brightRed}${t}${c.reset}`;
  if (s >= 400) return `${c.red}${t}${c.reset}`;
  if (s >= 300) return `${c.yellow}${t}${c.reset}`;
  return `${c.green}${t}${c.reset}`;
}

function msBadge(ms: number): string {
  const t = ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
  if (ms > 300) return `${c.red}${t}${c.reset}`;
  if (ms > 80) return `${c.yellow}${t}${c.reset}`;
  return `${c.dim}${t}${c.reset}`;
}

function levelBadge(type: string): string {
  if (type === "info") return `${c.cyan} INFO ${c.reset}`;
  if (type === "success") return `${c.green}  OK  ${c.reset}`;
  if (type === "ready") return `${c.brightGreen}${c.bold} READY ${c.reset}`;
  if (type === "warn") return `${c.yellow} WARN ${c.reset}`;
  if (type === "error") return `${c.brightRed}${c.bold} FAIL ${c.reset}`;
  if (type === "xmpp") return `${c.magenta} XMPP ${c.reset}`;
  if (type === "mm") return `${c.brightCyan}  MM  ${c.reset}`;
  if (type === "auth") return `${c.brightMagenta} AUTH ${c.reset}`;
  return ` ${type.toUpperCase().slice(0, 5).padEnd(5)} `;
}

export function log(type: string, message: string, details?: string) {
  const d = details ? ` ${c.dim}${details}${c.reset}` : "";
  console.log(`${ts()}${levelBadge(type)} ${message}${d}`);
}

type ReqInfo = {
  method: string;
  path: string;
  status: number;
  ms: number;
  season?: number;
  build?: number;
};

const SPAM = ["/storefront/v2/catalog", "/datarouter/api/v1/public/data"];

function shortPath(p: string): string {
  if (p.length <= 76) return p;
  return p.slice(0, 36) + "…" + p.slice(-39);
}

export function logRequest(r: ReqInfo) {
  const ver = r.season ? ` ${c.dim}[s${r.season}${r.build ? ` b${r.build}` : ""}]${c.reset}` : "";
  const line = `${ts()} ${statusBadge(r.status)} ${methodBadge(r.method)} ${c.white}${shortPath(r.path)}${c.reset} ${msBadge(r.ms)}${ver}`;
  if (SPAM.some((s) => r.path.includes(s))) console.log(`${c.dim}${line}${c.reset}`);
  else console.log(line);
}

const ART = [
  "____   ____                           ",
  "\\   \\ /   /___________  ___________   ",
  " \\   Y   // __ \\_  __ \\/  ___/\\__  \\  ",
  "  \\     /\\  ___/|  | \\/\\___ \\  / __ \\_ ",
  "   \\___/  \\___  >__|  /____  >(____  / ",
  "              \\/           \\/      \\/ ",
];

const ART_COLORS = ["\x1b[38;5;196m", "\x1b[38;5;200m", "\x1b[38;5;202m", "\x1b[38;5;208m", "\x1b[38;5;214m", "\x1b[38;5;220m"];

function artLine(row: string, color: string): string {
  return `  ${color}${c.bold}${row}${c.reset}`;
}

function svcDot(): string {
  return `${c.brightGreen}●${c.reset}`;
}

function kv(k: string, v: string, w = 6): string {
  return `  ${svcDot()}  ${c.bold}${c.white}${k.padEnd(w)}${c.reset} ${c.cyan}${v}${c.reset}`;
}

export function banner(port: number, xmpp: number, mm: number) {
  console.log("");
  ART.forEach((row, i) => console.log(artLine(row, ART_COLORS[i] || "\x1b[38;5;208m")));
  console.log(`  ${c.dim}https://github.com/Ducki67/Versa${c.reset}`);
  console.log("");
  console.log(kv("HTTP", `http://localhost:${port}`));
  console.log(kv("XMPP", `ws://localhost:${xmpp}`));
  console.log(kv("MM", `ws://localhost:${mm}`));
  console.log("");
}

export const logger = {
  info: (msg: string, detail?: string) => log("info", msg, detail),
  success: (msg: string, detail?: string) => log("success", msg, detail),
  ready: (msg: string, detail?: string) => log("ready", msg, detail),
  warn: (msg: string, detail?: string) => log("warn", msg, detail),
  error: (msg: string, detail?: string) => log("error", msg, detail),
  xmpp: (msg: string, detail?: string) => log("xmpp", msg, detail),
  mm: (msg: string, detail?: string) => log("mm", msg, detail),
  auth: (msg: string, detail?: string) => log("auth", msg, detail),
  request: logRequest,
  banner,
};
