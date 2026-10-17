/**
 * Structured JSON logging to stdout (collected by the hosting platform).
 * Never pass passwords, tokens, secrets, file contents or free-text matter notes.
 */
type Level = "debug" | "info" | "warn" | "error";
const REDACT = /pass(word)?|token|secret|authorization|cookie|api[_-]?key/i;

/**
 * Errors are reduced to name, message and Postgres error code. Query parameters (which can
 * contain matter names or amounts) and Postgres "detail" text are dropped.
 */
export function errorInfo(e: unknown): Record<string, unknown> {
  if (!(e instanceof Error)) return { message: String(e).slice(0, 200) };
  const clean = (m: string) => m.replace(/\nparams:[\s\S]*$/, "").slice(0, 500);
  const cause = (e as Error & { cause?: unknown }).cause as (Error & { code?: string }) | undefined;
  return {
    name: e.name,
    message: clean(e.message),
    ...(cause instanceof Error ? { cause: { name: cause.name, code: cause.code, message: clean(cause.message) } } : {}),
  };
}

function scrub(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACT.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = errorInfo(v);
    else out[k] = v;
  }
  return out;
}

function emit(level: Level, event: string, meta?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...scrub(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) => emit("debug", event, meta),
  info: (event: string, meta?: Record<string, unknown>) => emit("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => emit("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) => emit("error", event, meta),
};
