import crypto from "node:crypto";

// Deterministic text helpers — used by skill canonicalization and mock/deterministic
// hashing. Ported verbatim from convex/lib/text.ts (no external calls, same input
// always yields same output — preserves determinism).

export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// HMAC-SHA256 salted phone hash (64 hex characters). Replaces fnv1a, which is a 32-bit
// non-cryptographic hash: an Indian mobile number has about 10^9 possibilities, so every
// stored fnv1a digest could be reversed by brute force in seconds. The secret salt is what
// makes this different — without it, HMAC over the same tiny keyspace is just as reversible.
//
// So there is deliberately no default. A missing salt fails the request loudly instead of
// silently falling back to a constant, because a constant committed to a public repository is
// not a secret and would leave the hashing purely decorative while looking solved.
//
// PHONE_HASH_SALT must be set in Vercel *and* in the local .env used by seed.ts, and the two
// must match: the seed writes the hashes that sign-in later looks up. Treat it as permanent.
// Changing it orphans every migrated row — legacyPhoneHash below recovers fnv1a rows, but
// nothing recovers a row hashed under a previous salt.
export function hashPhone(e164: string): string {
  const salt = process.env.PHONE_HASH_SALT;
  if (!salt) {
    throw new Error(
      "PHONE_HASH_SALT is not set. Phone hashing needs a secret salt; refusing to fall back to a constant.",
    );
  }
  return crypto.createHmac("sha256", salt).update("phone:" + e164).digest("hex");
}

// Legacy FNV-1a hash → hex. Retained for automatic migration of existing rows and
// deterministically seeding a new signup's location/group index.
export function legacyPhoneHash(e164: string): string {
  return fnv1a("phone:" + e164);
}

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
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const g of ta) if (tb.has(g)) overlap++;
  return (2 * overlap) / (ta.size + tb.size);
}

// Levenshtein edit distance, two rows so memory is O(min(a,b)) rather than O(a*b).
export function editDistance(a: string, b: string): number {
  const s = normalize(a);
  const t = normalize(b);
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

// Is `input` a MISSPELLING of `candidate` — not "does it mean something similar".
//
// Character similarity cannot express meaning, and treating it as if it could produced real
// nonsense: "covering" scored 0.56 on trigrams against the alias "catering" and was filed
// under cooking. Two words differing by two letters are not related, they merely look alike.
//
// Meaning lives in the curated alias table instead, which is why "garment finishing" resolves
// to stitching despite sharing almost no characters with it.
//
// So this tier does one narrow job: absorb typos. Both tests must pass — high trigram overlap
// AND a small edit distance relative to word length. On real cases genuine typos land around
// 0.11 normalised edit distance ("stiching"/"stitching") while unrelated lookalikes sit at
// 0.25 ("covering"/"catering"), so the two are cleanly separable.
export function isProbableTypo(input: string, candidate: string): boolean {
  const a = normalize(input);
  const b = normalize(candidate);
  if (a === b) return true;
  // Too short to correct safely — at four characters one edit is a quarter of the word, and
  // "cook", "book" and "look" are all a single edit apart.
  if (a.length < 5 || b.length < 5) return false;
  if (similarity(a, b) < TYPO_TRIGRAM_MIN) return false;
  return editDistance(a, b) / Math.max(a.length, b.length) <= TYPO_EDIT_MAX;
}

export const TYPO_TRIGRAM_MIN = 0.7;
export const TYPO_EDIT_MAX = 0.15;
