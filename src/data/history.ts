/**
 * Fidelis rate history (RON + EUR tranches), 2024–2026.
 *
 * Rates are annual fixed coupons, in %, taken from Ministry of Finance
 * (Ministerul Finanțelor) communiqués for each Fidelis issuance. The table is
 * keyed by issuance month; each entry maps a maturity (in years) to its coupon,
 * for the RON tranche (`ron`) and, where offered/verifiable, the EUR tranche
 * (`eur`).
 *
 * `donor` is the special 2-year blood-donor tranche rate (RON), or `null` when
 * that issuance had no such tranche.
 *
 * Mid-2025 the 1 / 3 / 5-year RON tranches were replaced by 2 / 4 / 6-year ones;
 * the EUR ladder likewise moved from 1y+5y/7y to 3 / 5 / 10-year.
 *
 * NOTE: the 2024–2025 RON figures are drawn from the official MF communiqués.
 * The EUR maps and the 2026 editions are provisional — see the provenance note
 * above the table. Verify the final official terms on the source below before
 * subscribing.
 */

/** Official Ministry of Finance program page for Fidelis government bonds. */
export const MF_SOURCE = "https://mfinante.gov.ro/ro/web/titluridestat/fidelis";

/** A single Fidelis issuance (one per issuance month). */
export interface Issuance {
  /** Issuance id, `YYYY-MM`. */
  readonly id: string;
  /** Human-readable label, e.g. "Feb 2025". */
  readonly label: string;
  /** Map of maturity (years) -> annual fixed coupon (%) for the RON tranche. */
  readonly ron: Readonly<Record<number, number>>;
  /**
   * Map of maturity (years) -> annual fixed coupon (%) for the EUR (euro)
   * tranche, or absent when this issuance had no euro tranche (or its euro
   * terms could not be verified). EUR maturities differ from RON: 1/5-year
   * early on, then 3/5/10-year from late 2025. A EUR run is modeled in euro on
   * these coupons with no FX conversion.
   */
  readonly eur?: Readonly<Record<number, number>>;
  /** Special 2-year blood-donor tranche rate (%), or null if absent. RON only. */
  readonly donor: number | null;
  /** Source URL for this issuance's terms. */
  readonly source: string;
}

// PROVENANCE OF THE EUR TRANCHES AND THE 2026 RON EDITIONS
// ---------------------------------------------------------
// The RON coupons for 2024–2025 below are unchanged and remain the verified
// baseline (they are pinned by the golden regression fixture). The EUR maps and
// the 2026 RON editions were added later and are RECONSTRUCTED FROM ROMANIAN
// FINANCIAL-PRESS SUMMARIES of the Ministry of Finance communiqués, because the
// official MF/BVB/press sources were unreachable from the build environment for
// direct verification. Treat every `eur` map and every 2026 entry as
// PROVISIONAL until checked against the per-edition MF communiqué. Cells that
// are individually uncertain carry an inline `// unverified` / `// conflict`
// note. EUR tranches are omitted entirely for issuances whose euro terms could
// not be corroborated at all (rather than guessed).

export const HISTORY: readonly Issuance[] = [
  // 2024 — EUR ladder is short (1y) + 5y
  { id: "2024-08", label: "Aug 2024", ron: { 1: 5.8, 5: 7.0 }, eur: { 1: 4.0, 5: 5.0 }, donor: null, source: MF_SOURCE },
  { id: "2024-10", label: "Oct 2024", ron: { 1: 6.0, 3: 6.85, 5: 7.1 }, eur: { 1: 3.95, 5: 5.0 }, donor: 7.75, source: MF_SOURCE },
  { id: "2024-12", label: "Dec 2024", ron: { 1: 6.05, 3: 6.9, 5: 7.15 }, donor: 7.75, source: MF_SOURCE }, // EUR terms not corroborated
  // 2025 — EUR long tranche lengthens to 7y, then restructures to 3/5/10y
  { id: "2025-02", label: "Feb 2025", ron: { 1: 6.75, 3: 7.4, 5: 7.7 }, eur: { 2: 4.0, 7: 6.25 }, donor: 8.25, source: MF_SOURCE }, // eur 2y unverified
  { id: "2025-03", label: "Mar 2025", ron: { 1: 6.8, 3: 7.5, 5: 7.8 }, eur: { 2: 3.75, 7: 6.0 }, donor: 7.8, source: MF_SOURCE }, // eur unverified
  // election spike
  { id: "2025-05", label: "May 2025", ron: { 1: 6.9, 3: 7.55, 5: 7.8 }, donor: 7.75, source: MF_SOURCE }, // EUR terms not corroborated
  // restructure begins: 1/3/5y -> 2/4/6y (RON); EUR adds a 5y alongside the 7y
  { id: "2025-06", label: "Jun 2025", ron: { 2: 7.6, 4: 8.0, 6: 8.2 }, eur: { 2: 3.9, 5: 5.6, 7: 6.5 }, donor: 8.35, source: MF_SOURCE }, // eur unverified
  { id: "2025-08", label: "Aug 2025", ron: { 2: 7.05, 4: 7.55, 6: 7.9 }, donor: 7.55, source: MF_SOURCE }, // EUR breakdown not corroborated
  { id: "2025-09", label: "Sep 2025", ron: { 2: 7.0, 4: 7.5, 6: 7.85 }, donor: 7.55, source: MF_SOURCE }, // EUR breakdown not corroborated
  { id: "2025-10", label: "Oct 2025", ron: { 2: 6.95, 4: 7.45, 6: 7.8 }, donor: 7.55, source: MF_SOURCE }, // EUR terms not corroborated
  { id: "2025-11", label: "Nov 2025", ron: { 2: 6.75, 4: 7.3, 6: 7.7 }, donor: 7.55, source: MF_SOURCE }, // EUR terms not corroborated
  { id: "2025-12", label: "Dec 2025", ron: { 2: 6.55, 4: 7.2, 6: 7.55 }, eur: { 3: 3.75, 5: 4.75, 10: 6.2 }, donor: 7.55, source: MF_SOURCE },
  // 2026 — issued monthly; RON 2/4/6y (+2y donor), EUR 3/5/10y. All provisional.
  { id: "2026-01", label: "Jan 2026", ron: { 2: 6.45, 4: 7.1, 6: 7.5 }, eur: { 3: 3.75, 5: 4.75, 10: 6.2 }, donor: 7.45, source: MF_SOURCE },
  { id: "2026-02", label: "Feb 2026", ron: { 2: 6.15, 4: 6.75, 6: 7.25 }, eur: { 3: 3.6, 5: 4.5, 10: 6.0 }, donor: 7.15, source: MF_SOURCE }, // eur figures conflict across sources
  { id: "2026-03", label: "Mar 2026", ron: { 2: 5.9, 4: 6.6, 6: 7.1 }, eur: { 3: 3.5, 5: 4.5, 10: 6.0 }, donor: 6.9, source: MF_SOURCE },
  { id: "2026-04", label: "Apr 2026", ron: { 2: 6.6, 4: 7.1, 6: 7.6 }, eur: { 3: 4.25, 5: 5.25, 10: 6.4 }, donor: 7.6, source: MF_SOURCE }, // ron 4y unverified (interpolated)
  { id: "2026-05", label: "May 2026", ron: { 2: 6.4, 4: 7.0, 6: 7.5 }, eur: { 3: 4.0, 5: 5.0, 10: 6.25 }, donor: 7.4, source: MF_SOURCE },
  { id: "2026-06", label: "Jun 2026", ron: { 2: 6.35, 4: 7.05, 6: 7.6 }, eur: { 3: 4.0, 5: 4.85, 10: 5.8 }, donor: 7.35, source: MF_SOURCE }, // ron 4y unverified (interpolated)
  { id: "2026-07", label: "Jul 2026", ron: { 2: 6.3, 4: 6.85, 6: 7.55 }, eur: { 3: 3.9, 5: 4.8, 10: 6.2 }, donor: 7.3, source: MF_SOURCE },
];

/**
 * Simulation horizon, expressed in decimal years. Kept at mid-2026 so the
 * golden regression fixture (generated against this horizon) stays valid; the
 * 2026 editions are within it and accrue coupons up to this point.
 */
export const END = 2026 + 7 / 12;

/**
 * Earliest issuance offered as a start date in the UI. Issuances before this
 * one are still used for the rate table but are not selectable start points.
 */
export const FIRST_SELECTABLE = "2024-10";
