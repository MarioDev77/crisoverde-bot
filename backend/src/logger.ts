type LogLevel = "info" | "warn" | "error" | "debug";

const colors: Record<LogLevel, string> = {
  info:  "\x1b[36m",
  warn:  "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
};
const reset = "\x1b[0m";

function log(level: LogLevel, message: string, meta?: unknown): void {
  const isDev = process.env.NODE_ENV !== "production";
  const c = isDev ? colors[level] : "";
  const r = isDev ? reset : "";
  const m = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${c}[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${m}${r}`);
}

export const logger = {
  info:  (msg: string, meta?: unknown) => log("info", msg, meta),
  warn:  (msg: string, meta?: unknown) => log("warn", msg, meta),
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== "production") log("debug", msg, meta);
  },
};
