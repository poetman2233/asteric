/** Display formatting. All money is USD in V1; the organization currency setting is stored for V2. */
export function usd(n: number | null | undefined, opts: { compact?: boolean; dp?: number } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (opts.compact) {
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${n < 0 ? "−" : ""}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
    if (a >= 1_000) return `${n < 0 ? "−" : ""}$${Math.round(a / 1_000)}K`;
  }
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: opts.dp ?? 0, minimumFractionDigits: opts.dp ?? 0 })}`;
}
export function range(lo: number | null | undefined, hi: number | null | undefined): string {
  if (lo == null || hi == null) return "—";
  return `${usd(lo, { compact: true })}–${usd(hi, { compact: true }).replace("$", "$")}`;
}
export function pct(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(dp)}%`;
}
export function signedPct(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(dp)}%`;
}
export function months(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(dp)} mo`;
}
export function signedMonths(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)} mo`;
}
export function multiple(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}
export function num(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });
}
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-03-14" → "Mar 14, 2026" (dates are calendar dates; no timezone conversion). */
export function date(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, day] = s.split("-").map(Number);
  if (!y || !m || !day) return "—";
  return `${MONTH[m - 1]} ${day}, ${y}`;
}
/** Timestamp in the organization's timezone. */
export function dateTime(d: Date | string | null | undefined, tz = "UTC"): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(dt);
}
export function ago(d: Date | string, now = new Date()): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((now.getTime() - dt.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(dt);
}
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
