/**
 * REAL Fidelis rate history (RON tranches), 2024–2025.
 *
 * Rates are annual fixed coupons, in %, taken from Ministry of Finance
 * (Ministerul Finanțelor) communiqués for each Fidelis issuance. The table is
 * keyed by issuance month; each entry maps a maturity (in years) to its coupon.
 *
 * `donor` is the special 2-year blood-donor tranche rate (RON), or `null` when
 * that issuance had no such tranche.
 *
 * Mid-2025 the 1 / 3 / 5-year RON tranches were replaced by 2 / 4 / 6-year ones.
 *
 * NOTE: figures are drawn from the official MF communiqués for the Fidelis
 * program. Verify the final official terms on the source below before subscribing.
 */

/** Official Ministry of Finance program page for Fidelis government bonds. */
export const MF_SOURCE = "https://mfinante.gov.ro/ro/web/titluridestat/fidelis";

/** A single Fidelis issuance (one per issuance month). */
export interface Issuance {
  /** Issuance id, `YYYY-MM`. */
  readonly id: string;
  /** Human-readable label, e.g. "Feb 2025". */
  readonly label: string;
  /** Map of maturity (years) -> annual fixed coupon (%). */
  readonly ron: Readonly<Record<number, number>>;
  /** Special 2-year blood-donor tranche rate (%), or null if absent. */
  readonly donor: number | null;
  /** Source URL for this issuance's terms. */
  readonly source: string;
}

export const HISTORY: readonly Issuance[] = [
  // 2024
  { id: "2024-08", label: "Aug 2024", ron: { 1: 5.8, 5: 7.0 }, donor: null, source: MF_SOURCE },
  { id: "2024-10", label: "Oct 2024", ron: { 1: 6.0, 3: 6.85, 5: 7.1 }, donor: 7.75, source: MF_SOURCE },
  { id: "2024-12", label: "Dec 2024", ron: { 1: 6.05, 3: 6.9, 5: 7.15 }, donor: 7.75, source: MF_SOURCE },
  // 2025
  { id: "2025-02", label: "Feb 2025", ron: { 1: 6.75, 3: 7.4, 5: 7.7 }, donor: 8.25, source: MF_SOURCE },
  { id: "2025-03", label: "Mar 2025", ron: { 1: 6.8, 3: 7.5, 5: 7.8 }, donor: 7.8, source: MF_SOURCE },
  // election spike
  { id: "2025-05", label: "May 2025", ron: { 1: 6.9, 3: 7.55, 5: 7.8 }, donor: 7.75, source: MF_SOURCE },
  // restructure begins: 1/3/5y -> 2/4/6y
  { id: "2025-06", label: "Jun 2025", ron: { 2: 7.6, 4: 8.0, 6: 8.2 }, donor: 8.35, source: MF_SOURCE },
  { id: "2025-08", label: "Aug 2025", ron: { 2: 7.05, 4: 7.55, 6: 7.9 }, donor: 7.55, source: MF_SOURCE },
  { id: "2025-09", label: "Sep 2025", ron: { 2: 7.0, 4: 7.5, 6: 7.85 }, donor: 7.55, source: MF_SOURCE },
  { id: "2025-10", label: "Oct 2025", ron: { 2: 6.95, 4: 7.45, 6: 7.8 }, donor: 7.55, source: MF_SOURCE },
  { id: "2025-11", label: "Nov 2025", ron: { 2: 6.75, 4: 7.3, 6: 7.7 }, donor: 7.55, source: MF_SOURCE },
  { id: "2025-12", label: "Dec 2025", ron: { 2: 6.55, 4: 7.2, 6: 7.55 }, donor: 7.55, source: MF_SOURCE },
];

/** Simulation horizon: mid-2026, expressed in decimal years. */
export const END = 2026 + 7 / 12;

/**
 * Earliest issuance offered as a start date in the UI. Issuances before this
 * one are still used for the rate table but are not selectable start points.
 */
export const FIRST_SELECTABLE = "2024-10";
