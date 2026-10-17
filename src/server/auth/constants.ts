/** Shared auth constants. Safe to import from the edge/proxy layer (no secrets). */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-asteric_session" : "asteric_session";
/** Idle timeout: a session unused for this long expires. */
export const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_HOURS ?? 12) * 60 * 60 * 1000;
/** Absolute lifetime regardless of activity. */
export const SESSION_ABSOLUTE_MS = Number(process.env.SESSION_ABSOLUTE_DAYS ?? 14) * 24 * 60 * 60 * 1000;
