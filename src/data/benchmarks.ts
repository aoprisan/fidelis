/**
 * Macro benchmarks used to put the Fidelis results in context: the average
 * interest rate on new RON term deposits (households) and the consumer price
 * index, one observation per calendar month over the simulation window.
 *
 * Anchors drawn from published figures: BNR-reported average new RON household
 * term-deposit rates (~4.8%/an in late 2024, drifting up through the 2025
 * inflation episode); INS annual inflation of 5.1% (Dec 2024), 4.95%
 * (Jan 2025), 7.84% (Jul 2025, electricity price-cap removal), ~9.9%
 * (Aug 2025, VAT hike), 9.69% (Dec 2025) and 9.62% (Jan 2026). Months between
 * anchors are interpolated.
 *
 * NOTE: figures are approximations for an educational comparison. Verify
 * against the BNR and INS published series before relying on exact values.
 */

/** BNR interactive database — avg interest, new RON term deposits, households. */
export const BNR_SOURCE = "https://www.bnr.ro/Baza-de-date-interactiva-604.aspx";

/** INS — consumer price index (IPC), monthly series. */
export const INS_SOURCE = "https://insse.ro/cms/ro/content/ipc-serii-de-date";

/** Tax rate on bank-deposit interest income in Romania (10%). */
export const DEPOSIT_TAX = 0.1;

/** One monthly macro observation used as benchmark. */
export interface BenchmarkPoint {
  /** Month id, `YYYY-MM` (same convention as `Issuance.id`). */
  readonly id: string;
  /** Avg annual rate (%) for new RON term deposits, households (BNR). */
  readonly depositRate: number;
  /** Consumer price index, base Aug 2024 = 100 (INS IPC, chained monthly). */
  readonly cpiIndex: number;
}

/** Monthly series Aug 2024 → Jul 2026 (the last row is the horizon month). */
export const BENCHMARKS: readonly BenchmarkPoint[] = [
  // 2024
  { id: "2024-08", depositRate: 5.1, cpiIndex: 100.0 },
  { id: "2024-09", depositRate: 5.0, cpiIndex: 100.4 },
  { id: "2024-10", depositRate: 4.9, cpiIndex: 100.8 },
  { id: "2024-11", depositRate: 4.8, cpiIndex: 101.2 },
  { id: "2024-12", depositRate: 4.8, cpiIndex: 101.5 },
  // 2025
  { id: "2025-01", depositRate: 4.9, cpiIndex: 102.0 },
  { id: "2025-02", depositRate: 5.0, cpiIndex: 102.5 },
  { id: "2025-03", depositRate: 5.2, cpiIndex: 102.9 },
  { id: "2025-04", depositRate: 5.3, cpiIndex: 103.3 },
  // election-period liquidity stress pushes RON rates up
  { id: "2025-05", depositRate: 5.6, cpiIndex: 103.7 },
  { id: "2025-06", depositRate: 5.8, cpiIndex: 104.0 },
  // electricity price-cap removal
  { id: "2025-07", depositRate: 5.9, cpiIndex: 107.1 },
  // VAT hike
  { id: "2025-08", depositRate: 6.0, cpiIndex: 109.3 },
  { id: "2025-09", depositRate: 6.0, cpiIndex: 109.8 },
  { id: "2025-10", depositRate: 5.9, cpiIndex: 110.4 },
  { id: "2025-11", depositRate: 5.8, cpiIndex: 110.9 },
  { id: "2025-12", depositRate: 5.7, cpiIndex: 111.5 },
  // 2026
  { id: "2026-01", depositRate: 5.6, cpiIndex: 112.0 },
  { id: "2026-02", depositRate: 5.5, cpiIndex: 112.4 },
  { id: "2026-03", depositRate: 5.4, cpiIndex: 112.8 },
  { id: "2026-04", depositRate: 5.4, cpiIndex: 113.2 },
  { id: "2026-05", depositRate: 5.3, cpiIndex: 113.6 },
  { id: "2026-06", depositRate: 5.3, cpiIndex: 114.0 },
  { id: "2026-07", depositRate: 5.2, cpiIndex: 114.4 },
];
