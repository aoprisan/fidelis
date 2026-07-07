import { HISTORY, type Issuance } from "../data/history";

/** Lookup of issuance by id. */
export const byId: Readonly<Record<string, Issuance>> = Object.fromEntries(
  HISTORY.map((h) => [h.id, h]),
);

/** Convert an issuance id (`YYYY-MM`) to a decimal year. */
export const idToYear = (id: string): number => {
  const [y, m] = id.split("-").map(Number);
  return y + (m - 1) / 12;
};

/** Available maturities (years) at a given issuance, ascending. */
export function matsAt(id: string): number[] {
  return Object.keys(byId[id].maturities)
    .map(Number)
    .sort((a, b) => a - b);
}

/** A resolved coupon: the chosen rate and the maturity it maps to. */
export interface Coupon {
  rate: number;
  mat: number;
}

/**
 * Pick the coupon for a chosen target maturity at a given issuance, falling
 * back to the closest available maturity (this handles the 1/3/5 -> 2/4/6
 * switch). A donor tranche, when present, maps to its own maturity — which is
 * 1-year for 2024/early-2025 issuances and 2-year from Jun 2025 onward.
 */
export function couponFor(id: string, targetMat: number, donor: boolean): Coupon {
  const h = byId[id];
  if (donor && h.donorRate != null)
    return { rate: h.donorRate, mat: h.donorMaturity ?? 2 };
  const avail = matsAt(id);
  // exact
  if (h.maturities[targetMat] != null)
    return { rate: h.maturities[targetMat], mat: targetMat };
  // nearest maturity
  const best = avail.reduce(
    (a, b) => (Math.abs(b - targetMat) < Math.abs(a - targetMat) ? b : a),
    avail[0],
  );
  return { rate: h.maturities[best], mat: best };
}

/** Find the issuance at or after a decimal year (used for reinvestment). */
export function issuanceAtOrAfter(year: number): Issuance {
  for (const h of HISTORY) {
    if (idToYear(h.id) >= year - 0.001) return h;
  }
  return HISTORY[HISTORY.length - 1];
}
