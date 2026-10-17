/** Deterministic value parsers for messy spreadsheet cells. Return null when a value cannot be read. */

const EMPTY = new Set(["", "-", "—", "–", "n/a", "na", "none", "null", "tbd", "unknown", "?", "#n/a"]);
export const isEmpty = (v: unknown) => v == null || (typeof v === "string" && EMPTY.has(v.trim().toLowerCase()));

export function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function parseMoney(v: unknown): number | null {
  if (isEmpty(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().toLowerCase().replace(/usd|\$|,|\s/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const m = s.match(/^(-?\d+(?:\.\d+)?)(k|m|mm|b)?$/);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] === "k") n *= 1_000;
  else if (m[2] === "m" || m[2] === "mm") n *= 1_000_000;
  else if (m[2] === "b") n *= 1_000_000_000;
  return neg ? -n : n;
}

export function parseNumber(v: unknown): number | null {
  if (isEmpty(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** "65%", "0.65", "65" → 0.65. Values above 1 are read as percentages. */
export function parsePercent(v: unknown): number | null {
  if (isEmpty(v)) return null;
  const s = typeof v === "number" ? String(v) : String(v).replace("%", "").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  const p = n > 1 ? n / 100 : n;
  return p <= 1 ? Math.round(p * 10000) / 10000 : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
function valid(y: number, m: number, d: number): string | null {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parses ISO, US (M/D/Y), "Mar 14, 2023", "14-Mar-2023", Excel serials and Date objects into YYYY-MM-DD. */
export function parseDate(v: unknown): string | null {
  if (isEmpty(v)) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) { // Excel serial date
      const ms = Math.round((v - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return valid(y, +m[1]!, +m[2]!);
  }
  m = s.match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i);
  if (m && MONTHS[m[1]!.slice(0, 3).toLowerCase()]) {
    return valid(+m[3]!, MONTHS[m[1]!.slice(0, 3).toLowerCase()]!, +m[2]!);
  }
  m = s.match(/^(\d{1,2})[- ]([a-z]{3})[a-z]*[- ](\d{2,4})$/i);
  if (m && MONTHS[m[2]!.toLowerCase()]) {
    let y = +m[3]!;
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return valid(y, MONTHS[m[2]!.toLowerCase()]!, +m[1]!);
  }
  return null;
}

export function looksLike(kind: "money" | "date" | "percent" | "number", v: unknown): boolean {
  if (isEmpty(v)) return false;
  if (kind === "date") return parseDate(v) != null;
  if (kind === "money") return parseMoney(v) != null && (typeof v === "number" || /\$|\d{3}|k$|m$/i.test(String(v)));
  if (kind === "percent") return parsePercent(v) != null && (typeof v === "number" ? v <= 100 : /%|^0?\.\d+$|^\d{1,3}$/.test(String(v).trim()));
  return parseNumber(v) != null;
}
