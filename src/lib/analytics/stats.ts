/** Statistical primitives. Pure and deterministic. */

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Linear-interpolated quantile (type 7, the common default). */
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Wilson score interval for a binomial proportion. */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

const DAY = 24 * 60 * 60 * 1000;
/** Months between two ISO dates, using the average Gregorian month (30.4375 days). */
export function monthsBetween(from: string, to: string): number {
  const a = Date.parse(from.length === 10 ? `${from}T00:00:00Z` : from);
  const b = Date.parse(to.length === 10 ? `${to}T00:00:00Z` : to);
  return (b - a) / DAY / 30.4375;
}
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from.length === 10 ? `${from}T00:00:00Z` : from);
  const b = Date.parse(to.length === 10 ? `${to}T00:00:00Z` : to);
  return Math.round((b - a) / DAY);
}

export function histogram(xs: number[], edges: number[]): { from: number; to: number; count: number }[] {
  const out = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1]!, count: 0 }));
  for (const x of xs) {
    const idx = out.findIndex((b, i) => x >= b.from && (x < b.to || (i === out.length - 1 && x <= b.to)));
    if (idx >= 0) out[idx]!.count++;
    else if (x < edges[0]!) out[0]!.count++;
    else out[out.length - 1]!.count++;
  }
  return out;
}

export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
