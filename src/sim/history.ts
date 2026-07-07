import { HISTORY, type Issuance } from "../data/history";
import type { Currency } from "./simulate";

/** Lookup of issuance by id. */
export const byId: Readonly<Record<string, Issuance>> = Object.fromEntries(
  HISTORY.map((h) => [h.id, h]),
);

/** Convert an issuance id (`YYYY-MM`) to a decimal year. */
export const idToYear = (id: string): number => {
  const [y, m] = id.split("-").map(Number);
  return y + (m - 1) / 12;
};

/** The coupon map (maturity → rate) of an issuance for a given currency. */
export function couponsOf(h: Issuance, cur: Currency = "RON"): Readonly<Record<number, number>> {
  return (cur === "EUR" ? h.eur : h.ron) ?? {};
}

/** Whether an issuance offers any tranche in the given currency. */
export function hasCurrency(h: Issuance, cur: Currency = "RON"): boolean {
  return Object.keys(couponsOf(h, cur)).length > 0;
}

/** Available maturities (years) at a given issuance, ascending. */
export function matsAt(id: string, cur: Currency = "RON"): number[] {
  return Object.keys(couponsOf(byId[id], cur))
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
 * switch). A donor tranche, when present, always maps to the 2-year rate; the
 * donor tranche is a RON-only product, so it is ignored for EUR runs.
 */
export function couponFor(
  id: string,
  targetMat: number,
  donor: boolean,
  cur: Currency = "RON",
): Coupon {
  const h = byId[id];
  if (cur === "RON" && donor && h.donor != null) return { rate: h.donor, mat: 2 };
  const rates = couponsOf(h, cur);
  const avail = matsAt(id, cur);
  // exact
  if (rates[targetMat] != null) return { rate: rates[targetMat], mat: targetMat };
  // nearest maturity
  const best = avail.reduce(
    (a, b) => (Math.abs(b - targetMat) < Math.abs(a - targetMat) ? b : a),
    avail[0],
  );
  return { rate: rates[best], mat: best };
}

/**
 * Find the issuance at or after a decimal year that offers a tranche in `cur`
 * (used for reinvestment rollover). Falls back to the latest issuance carrying
 * that currency, then to the very last issuance.
 */
export function issuanceAtOrAfter(year: number, cur: Currency = "RON"): Issuance {
  for (const h of HISTORY) {
    if (idToYear(h.id) >= year - 0.001 && hasCurrency(h, cur)) return h;
  }
  for (let i = HISTORY.length - 1; i >= 0; i--) {
    if (hasCurrency(HISTORY[i], cur)) return HISTORY[i];
  }
  return HISTORY[HISTORY.length - 1];
}
