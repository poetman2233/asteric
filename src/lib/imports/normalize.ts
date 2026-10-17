import { bigramSimilarity, containsPhrase, normText, tokenSimilarity } from "./text";
import { isEmpty } from "./values";

export const AUTO_ACCEPT = 0.85;
export type Normalized = { value: string | null; confidence: number; method: "exact" | "synonym" | "similar" | "fallback" | "ai" | "empty" };

export type CategoryOption = { key: string; label: string; synonyms: string[] };

/** Maps a free-text category onto the organization's canonical categories. */
export function normalizeCategory(raw: string, options: CategoryOption[]): Normalized {
  if (isEmpty(raw)) return { value: null, confidence: 1, method: "empty" };
  const r = normText(raw);
  for (const o of options) {
    if ([o.label, o.key.replace(/_/g, " "), ...o.synonyms].map(normText).includes(r)) return { value: o.key, confidence: 0.98, method: "exact" };
  }
  let best: { key: string; len: number } | null = null;
  for (const o of options) {
    for (const s of [o.label, ...o.synonyms]) {
      const n = normText(s);
      if (n.length >= 3 && containsPhrase(r, n) && (!best || n.length > best.len)) best = { key: o.key, len: n.length };
    }
  }
  if (best) {
    // Short synonyms ("wt", "term") and the catch-all "other" are too ambiguous to auto-accept.
    const confidence = best.key === "other" ? 0.6 : best.len >= 5 ? 0.86 : 0.72;
    return { value: best.key, confidence, method: "synonym" };
  }
  let sim = { key: "", s: 0 };
  for (const o of options) {
    for (const s of [o.label, ...o.synonyms]) {
      const v = Math.max(tokenSimilarity(r, s), bigramSimilarity(r, s));
      if (v > sim.s) sim = { key: o.key, s: v };
    }
  }
  if (sim.s >= 0.5) return { value: sim.key, confidence: Math.round((0.4 + 0.4 * sim.s) * 100) / 100, method: "similar" };
  const other = options.find((o) => o.key === "other");
  return { value: other?.key ?? null, confidence: 0.2, method: "fallback" };
}

const OPEN = ["open", "active", "pending", "in litigation", "ongoing", "current", "pre litigation", "prelit", "litigation", "intake", "new"];
const CLOSED = ["closed", "resolved", "settled", "dismissed", "concluded", "complete", "completed", "disposed", "archived", "inactive", "won", "lost"];

export function normalizeStatus(raw: string, hasCloseDate: boolean): Normalized {
  if (isEmpty(raw)) return { value: hasCloseDate ? "closed" : "open", confidence: hasCloseDate ? 0.9 : 0.7, method: "fallback" };
  const r = normText(raw);
  if (OPEN.includes(r)) return { value: "open", confidence: 0.98, method: "exact" };
  if (CLOSED.includes(r)) return { value: "closed", confidence: 0.98, method: "exact" };
  if (CLOSED.some((c) => containsPhrase(r, c))) return { value: "closed", confidence: 0.86, method: "synonym" };
  if (OPEN.some((c) => containsPhrase(r, c))) return { value: "open", confidence: 0.86, method: "synonym" };
  return { value: hasCloseDate ? "closed" : "open", confidence: 0.5, method: "fallback" };
}

const RESOLUTION_RULES: { key: string; phrases: string[] }[] = [
  { key: "judgment_defense", phrases: ["defense verdict", "verdict for defendant", "judgment for defendant", "defense judgment", "lost at trial", "msj granted", "summary judgment granted"] },
  { key: "arbitration_defense", phrases: ["arbitration defense", "lost arbitration", "arbitration denied"] },
  { key: "arbitration_award", phrases: ["arbitration award", "arbitration", "award"] },
  { key: "judgment_plaintiff", phrases: ["plaintiff verdict", "verdict for plaintiff", "judgment for plaintiff", "jury verdict", "verdict", "judgment", "won at trial"] },
  { key: "settlement", phrases: ["settlement", "settled", "settle", "mediated settlement", "pre litigation settlement", "resolved by settlement"] },
  { key: "dismissal", phrases: ["dismissed", "dismissal", "voluntary dismissal", "dismissed with prejudice", "demurrer sustained"] },
  { key: "withdrawn", phrases: ["withdrawn", "withdrew", "declined", "dropped", "abandoned", "client withdrew", "substituted out"] },
];

export function normalizeResolution(raw: string): Normalized {
  if (isEmpty(raw)) return { value: null, confidence: 1, method: "empty" };
  const r = normText(raw);
  for (const rule of RESOLUTION_RULES) if (rule.phrases.map(normText).includes(r)) return { value: rule.key, confidence: 0.97, method: "exact" };
  for (const rule of RESOLUTION_RULES) if (rule.phrases.some((p) => containsPhrase(r, p))) return { value: rule.key, confidence: 0.86, method: "synonym" };
  return { value: "other", confidence: 0.3, method: "fallback" };
}

const TITLES = /\b(esq|esquire|mr|mrs|ms|dr|jr|sr|attorney|atty)\b\.?/gi;

/** "ROSS, JANE" → "Jane Ross"; trims titles and whitespace. */
export function cleanPersonName(raw: string): string {
  let s = raw.replace(TITLES, "").replace(/\s+/g, " ").trim().replace(/[,;]$/, "");
  const comma = s.match(/^([^,]+),\s*(.+)$/);
  if (comma) s = `${comma[2]} ${comma[1]}`;
  return s.split(" ").filter(Boolean).map((w) => (w.length <= 2 && w.endsWith(".") ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join(" ");
}

/** Cluster key: first initial + last name ("jane ross", "J. Ross" → "j ross"). */
export function personKey(raw: string): string {
  const parts = normText(cleanPersonName(raw)).split(" ").filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]![0]} ${parts[parts.length - 1]}`;
}

/**
 * Groups name variants (people or referral sources) and proposes a canonical label.
 * Exact matches to an existing record are accepted; merged variants require review.
 */
export function clusterNames(values: { raw: string; count: number }[], existing: string[], person: boolean): Map<string, Normalized> {
  const keyOf = (s: string) => (person ? personKey(s) : normText(s));
  const existingByKey = new Map(existing.map((e) => [keyOf(e), e]));
  const groups = new Map<string, { raw: string; count: number }[]>();
  for (const v of values) {
    if (isEmpty(v.raw)) continue;
    const k = keyOf(v.raw);
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const out = new Map<string, Normalized>();
  for (const [k, vs] of groups) {
    const ex = existingByKey.get(k);
    // For people, a written-out first name ("Marco Rodriguez") beats an initial ("M. Rodriguez") even if rarer.
    const full = (r: string) => (person && /^[A-Za-z]{2,}\s/.test(cleanPersonName(r)) ? 1 : 0);
    const preferred = ex ?? [...vs].sort((a, b) => full(b.raw) - full(a.raw) || b.count - a.count || b.raw.length - a.raw.length)[0]!.raw;
    const label = person ? cleanPersonName(preferred) : preferred.trim().replace(/\s+/g, " ");
    for (const v of vs) {
      const identical = normText(v.raw) === normText(label) || (person && normText(cleanPersonName(v.raw)) === normText(label));
      out.set(v.raw, { value: label, confidence: identical ? (ex ? 1 : 0.95) : 0.78, method: identical ? "exact" : "similar" });
    }
  }
  return out;
}
