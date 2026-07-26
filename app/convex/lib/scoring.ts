// Deterministic scoring. Weights are fixed config; same inputs → same score → same ranking.
export const WEIGHTS = { skill: 0.5, dist: 0.3, earn: 0.2 } as const;

export function proximity(distanceKm: number): number {
  if (!isFinite(distanceKm)) return 0;
  return 1 / (1 + distanceKm);
}

export function normalizedPay(pay: number | undefined): number {
  if (!pay || pay <= 0) return 0;
  return Math.min(1, pay / 2000);
}

export function skillFit(proficiency: number): number {
  return Math.max(0, Math.min(1, proficiency / 5));
}

export function score(fit: number, distanceKm: number, pay: number | undefined): {
  skillFit: number;
  proximity: number;
  pay: number;
  total: number;
} {
  const prox = proximity(distanceKm);
  const payN = normalizedPay(pay);
  const total = WEIGHTS.skill * fit + WEIGHTS.dist * prox + WEIGHTS.earn * payN;
  return { skillFit: fit, proximity: prox, pay: payN, total };
}
