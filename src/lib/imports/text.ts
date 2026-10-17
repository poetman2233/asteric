export function normText(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/#/g, " number ").replace(/\bno\.?\b/g, " number ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
export const tokens = (s: string) => normText(s).split(" ").filter(Boolean);

/** Dice coefficient over word tokens. */
export function tokenSimilarity(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Dice coefficient over character bigrams; tolerant of typos and abbreviations. */
export function bigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = normText(s).replace(/ /g, "");
    const g = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) g.set(t.slice(i, i + 2), (g.get(t.slice(i, i + 2)) ?? 0) + 1);
    return g;
  };
  const A = grams(a), B = grams(b);
  let inter = 0, total = 0;
  for (const [k, n] of A) { inter += Math.min(n, B.get(k) ?? 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

/** True when `phrase` occurs in `text` on word boundaries (both normalized). */
export function containsPhrase(text: string, phrase: string): boolean {
  const t = ` ${normText(text)} `, p = ` ${normText(phrase)} `;
  return p.trim().length > 0 && t.includes(p);
}
