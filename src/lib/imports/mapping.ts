import { CANONICAL_FIELDS, SOURCE_SIGNATURES, type CanonicalField } from "./fields";
import { bigramSimilarity, containsPhrase, normText, tokenSimilarity } from "./text";
import { isEmpty, looksLike } from "./values";

export type MappingMethod = "exact" | "synonym" | "similar" | "ai" | "manual" | "none";
export type ColumnMapping = { column: string; field: string | null; confidence: number; method: MappingMethod; samples: string[] };

function headerScore(header: string, f: CanonicalField): { score: number; method: MappingMethod } {
  const h = normText(header);
  if (!h) return { score: 0, method: "none" };
  const names = [f.label, f.key.replace(/_/g, " "), ...f.synonyms].map(normText);
  if (names.includes(h)) return { score: 0.98, method: "exact" };
  let best = 0;
  for (const n of names) {
    if (n.length >= 4 && containsPhrase(h, n)) best = Math.max(best, 0.7 + 0.18 * Math.min(1, n.length / Math.max(h.length, 1)));
    else if (h.length >= 4 && containsPhrase(n, h)) best = Math.max(best, 0.72);
  }
  if (best) return { score: best, method: "synonym" };
  const sim = Math.max(...names.map((n) => Math.max(tokenSimilarity(h, n), bigramSimilarity(h, n) * 0.9)));
  return sim >= 0.5 ? { score: 0.35 + 0.4 * sim, method: "similar" } : { score: 0, method: "none" };
}

function typeFit(f: CanonicalField, samples: unknown[]): number {
  const filled = samples.filter((s) => !isEmpty(s));
  if (!filled.length) return 1;
  const kind = f.kind === "money" ? "money" : f.kind === "date" ? "date" : f.kind === "percent" ? "percent" : f.kind === "number" ? "number" : null;
  if (!kind) {
    // Text-like fields should not be mostly numbers or dates.
    const numeric = filled.filter((s) => looksLike("number", s) || looksLike("date", s)).length / filled.length;
    return f.key === "external_id" ? 1 : numeric > 0.8 ? 0.6 : 1;
  }
  const share = filled.filter((s) => looksLike(kind, s)).length / filled.length;
  return share >= 0.8 ? 1.04 : share >= 0.5 ? 0.9 : 0.55;
}

/**
 * Proposes a one-to-one mapping from source columns to canonical fields.
 * Highest-confidence pairs are assigned first; each field and column is used once.
 */
export function suggestMapping(headers: string[], rows: Record<string, unknown>[]): ColumnMapping[] {
  const sampleOf = (h: string) => rows.slice(0, 50).map((r) => r[h]);
  const cands: { column: string; field: string; score: number; method: MappingMethod }[] = [];
  for (const h of headers) {
    const samples = sampleOf(h);
    for (const f of CANONICAL_FIELDS) {
      const { score, method } = headerScore(h, f);
      if (score <= 0) continue;
      const adj = Math.min(0.99, score * typeFit(f, samples));
      if (adj >= 0.45) cands.push({ column: h, field: f.key, score: adj, method });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const usedF = new Set<string>(), usedC = new Set<string>();
  const chosen = new Map<string, { field: string; score: number; method: MappingMethod }>();
  for (const c of cands) {
    if (usedF.has(c.field) || usedC.has(c.column)) continue;
    usedF.add(c.field); usedC.add(c.column);
    chosen.set(c.column, c);
  }
  return headers.map((h) => {
    const c = chosen.get(h);
    const samples = sampleOf(h).filter((s) => !isEmpty(s)).slice(0, 3).map((s) => (s instanceof Date ? s.toISOString().slice(0, 10) : String(s)).slice(0, 60));
    return c ? { column: h, field: c.field, confidence: Math.round(c.score * 100) / 100, method: c.method, samples } : { column: h, field: null, confidence: 0, method: "none", samples };
  });
}

export function detectSourceSystem(headers: string[]): string | null {
  const joined = ` ${headers.map((h) => normText(h)).join(" | ")} `;
  let best: { system: string; hits: number } | null = null;
  for (const s of SOURCE_SIGNATURES) {
    const hits = s.tokens.filter((t) => joined.includes(normText(t))).length;
    if (hits >= 2 && (!best || hits > best.hits)) best = { system: s.system, hits };
  }
  return best?.system ?? null;
}
