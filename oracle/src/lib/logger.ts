type LogLevel = "info" | "warn" | "error";

// One JSON object per line to stdout/stderr — parseable in Render's log
// viewer (and any log aggregator), unlike ad-hoc string-concatenated
// console.log calls that bury structured fields in free text.
function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  const entry = { timestamp: new Date().toISOString(), level, message, ...context };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};
