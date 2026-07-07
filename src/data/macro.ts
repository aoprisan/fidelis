/**
 * Macro drivers aligned to each Fidelis RON issuance month, 2024–2025.
 *
 * Three series feed the forecast regression:
 *   - `nbr`    National Bank of Romania (BNR) key policy rate, in %.
 *   - `cpi`    Headline CPI inflation, year-on-year, in % (INS).
 *   - `eurRon` EUR/RON reference exchange rate (BNR fixing), lei per euro.
 *
 * IMPORTANT — these figures are APPROXIMATE, rounded, illustrative values
 * compiled from public BNR and INS releases and are provided only to make the
 * teaching regression reproducible. They are NOT an official dataset. Verify
 * the real series at bnr.ro and insse.ro before drawing any conclusion. The
 * whole module is educational and is not investment advice.
 *
 * Each entry's `id` matches an issuance `id` in `data/history.ts`, so the
 * forecast can join coupons to the macro conditions at issuance.
 */

/** BNR statistics portal (policy rate, FX fixings). */
export const BNR_SOURCE = "https://www.bnr.ro/Statistics-report-1124.aspx";
/** INS (National Institute of Statistics) inflation portal. */
export const INS_SOURCE = "https://insse.ro/cms/en/tags/inflation";

/** One month of macro conditions, keyed to an issuance id (`YYYY-MM`). */
export interface MacroPoint {
  /** Issuance id, `YYYY-MM` — matches `data/history.ts`. */
  readonly id: string;
  /** BNR key policy rate (%). */
  readonly nbr: number;
  /** CPI inflation, year-on-year (%). */
  readonly cpi: number;
  /** EUR/RON reference rate (lei per euro). */
  readonly eurRon: number;
}

/**
 * Approximate macro series, one point per issuance month. Values are rounded
 * and illustrative (see the module note above).
 */
export const MACRO: readonly MacroPoint[] = [
  // 2024 — BNR easing from 7.00% earlier in the year; inflation drifting down.
  { id: "2024-08", nbr: 6.75, cpi: 5.4, eurRon: 4.975 },
  { id: "2024-10", nbr: 6.5, cpi: 4.7, eurRon: 4.976 },
  { id: "2024-12", nbr: 6.5, cpi: 5.1, eurRon: 4.975 },
  // 2025 — rate held at 6.50%; leu weakens through the election period; a
  // mid-year VAT/energy adjustment pushes CPI sharply higher.
  { id: "2025-02", nbr: 6.5, cpi: 5.0, eurRon: 4.977 },
  { id: "2025-03", nbr: 6.5, cpi: 4.9, eurRon: 4.977 },
  { id: "2025-05", nbr: 6.5, cpi: 5.4, eurRon: 5.02 },
  { id: "2025-06", nbr: 6.5, cpi: 5.7, eurRon: 5.06 },
  { id: "2025-08", nbr: 6.5, cpi: 7.8, eurRon: 5.07 },
  { id: "2025-09", nbr: 6.5, cpi: 8.0, eurRon: 5.07 },
  { id: "2025-10", nbr: 6.5, cpi: 8.4, eurRon: 5.08 },
  { id: "2025-11", nbr: 6.5, cpi: 8.2, eurRon: 5.09 },
  { id: "2025-12", nbr: 6.5, cpi: 7.9, eurRon: 5.1 },
];

/** Lookup of macro point by issuance id. */
export const macroById: Readonly<Record<string, MacroPoint>> = Object.fromEntries(
  MACRO.map((m) => [m.id, m]),
);

/** The most recent macro reading — the default anchor for the base scenario. */
export const LATEST_MACRO: MacroPoint = MACRO[MACRO.length - 1];
