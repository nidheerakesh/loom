// Deterministic text helpers — used by skill canonicalization (S9) and mock hashing.
// No external calls; same input always yields same output (preserves determinism).

export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// FNV-1a hash → hex. NOT cryptographically secure; demo-only stand-in for a salted
// hash of phone numbers / OTP codes so raw values are never stored.
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

// Sørensen–Dice coefficient over character trigrams → [0,1].
// Deterministic stand-in for LaBSE cosine similarity (swappable interface).
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

// Above this, a phrase resolves to an existing canonical skill; below → review candidate.
export const SKILL_MERGE_THRESHOLD = 0.5;
