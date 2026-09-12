const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function getTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function log(
  type: string,
  message: string,
  details?: string
) {
  const ts = `${colors.gray}${getTimestamp()}${colors.reset}`;
  let label: string;
  switch (type) {
    case "info":
      label = `${colors.cyan}INFO${colors.reset}`;
      break;
    case "success":
      label = `${colors.green}OK${colors.reset}`;
      break;
    case "warn":
      label = `${colors.yellow}WARN${colors.reset}`;
      break;
    case "error":
      label = `${colors.red}ERR${colors.reset}`;
      break;
    default:
      label = type.toUpperCase();
  }
  const detail = details ? ` ${colors.gray}${details}${colors.reset}` : "";
  console.log(`${ts} ${label} ${message}${detail}`);
}

export const logger = {
  info: (msg: string, detail?: string) => log("info", msg, detail),
  success: (msg: string, detail?: string) => log("success", msg, detail),
  warn: (msg: string, detail?: string) => log("warn", msg, detail),
  error: (msg: string, detail?: string) => log("error", msg, detail),
};
