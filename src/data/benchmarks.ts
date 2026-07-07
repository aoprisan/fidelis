/**
 * Macro benchmarks used to put the Fidelis results in context, one observation
 * per calendar month over the simulation window. Two parallel series:
 *
 *  - RON: the average interest rate on new RON term deposits (households) and
 *    the Romanian consumer price index (INS IPC).
 *  - EUR: a representative interest rate on EUR term deposits offered to
 *    Romanian retail savers, and the euro-area HICP, for putting a EUR Fidelis
 *    tranche against a euro deposit and euro-area inflation.
 *
 * RON anchors drawn from published figures: BNR-reported average new RON
 * household term-deposit rates (~4.8%/an in late 2024, drifting up through the
 * 2025 inflation episode); INS annual inflation of 5.1% (Dec 2024), 4.95%
 * (Jan 2025), 7.84% (Jul 2025, electricity price-cap removal), ~9.9%
 * (Aug 2025, VAT hike), 9.69% (Dec 2025) and 9.62% (Jan 2026).
 *
 * EUR anchors: Romanian retail EUR term-deposit rates sit well below the
 * euro-area average (BNR new-EUR-deposit ~1.85% Dec 2024 / ~1.67% Jan 2025,
 * bank shelf rates ~1.0–1.5%), easing as the ECB cut through 2025. Euro-area
 * HICP ran ~2% (2.2% Aug 2024, 2.0% Aug 2025, 1.9% Dec 2025) with a spring-2026
 * energy-driven pickup to ~3%. Months between anchors are interpolated.
 *
 * NOTE: figures are approximations for an educational comparison, and the EUR
 * series in particular is provisional — the BNR EUR series and the raw HICP
 * index could not be fetched directly for verification (only the annual ECB /
 * Eurostat anchors above). Verify against the BNR, INS, ECB and Eurostat
 * published series before relying on exact values.
 */

/** BNR interactive database — avg interest, new RON/EUR term deposits, households. */
export const BNR_SOURCE = "https://www.bnr.ro/Baza-de-date-interactiva-604.aspx";

/** INS — consumer price index (IPC), monthly series. */
export const INS_SOURCE = "https://insse.ro/cms/ro/content/ipc-serii-de-date";

/** ECB — euro area bank interest rate statistics (new household deposits). */
export const ECB_SOURCE = "https://data.ecb.europa.eu/";

/** Eurostat — euro-area HICP (harmonised index of consumer prices). */
export const EUROSTAT_SOURCE = "https://ec.europa.eu/eurostat/web/hicp";

/** Tax rate on bank-deposit interest income in Romania (10%, RON and EUR). */
export const DEPOSIT_TAX = 0.1;

/** One monthly macro observation used as benchmark. */
export interface BenchmarkPoint {
  /** Month id, `YYYY-MM` (same convention as `Issuance.id`). */
  readonly id: string;
  /** Avg annual rate (%) for new RON term deposits, households (BNR). */
  readonly depositRate: number;
  /** Consumer price index, base Aug 2024 = 100 (INS IPC, chained monthly). */
  readonly cpiIndex: number;
  /** Representative annual rate (%) for EUR term deposits, Romanian retail. */
  readonly eurDepositRate: number;
  /** Euro-area HICP, base Aug 2024 = 100 (Eurostat, chained monthly). */
  readonly eurCpiIndex: number;
}

/** Monthly series Aug 2024 → Jul 2026 (the last row is the horizon month). */
export const BENCHMARKS: readonly BenchmarkPoint[] = [
  // 2024
  { id: "2024-08", depositRate: 5.1, cpiIndex: 100.0, eurDepositRate: 2.0, eurCpiIndex: 100.0 },
  { id: "2024-09", depositRate: 5.0, cpiIndex: 100.4, eurDepositRate: 1.95, eurCpiIndex: 100.17 },
  { id: "2024-10", depositRate: 4.9, cpiIndex: 100.8, eurDepositRate: 1.92, eurCpiIndex: 100.33 },
  { id: "2024-11", depositRate: 4.8, cpiIndex: 101.2, eurDepositRate: 1.88, eurCpiIndex: 100.5 },
  { id: "2024-12", depositRate: 4.8, cpiIndex: 101.5, eurDepositRate: 1.85, eurCpiIndex: 100.67 },
  // 2025
  { id: "2025-01", depositRate: 4.9, cpiIndex: 102.0, eurDepositRate: 1.67, eurCpiIndex: 100.83 },
  { id: "2025-02", depositRate: 5.0, cpiIndex: 102.5, eurDepositRate: 1.6, eurCpiIndex: 101.0 },
  { id: "2025-03", depositRate: 5.2, cpiIndex: 102.9, eurDepositRate: 1.55, eurCpiIndex: 101.17 },
  { id: "2025-04", depositRate: 5.3, cpiIndex: 103.3, eurDepositRate: 1.5, eurCpiIndex: 101.33 },
  // election-period liquidity stress pushes RON rates up
  { id: "2025-05", depositRate: 5.6, cpiIndex: 103.7, eurDepositRate: 1.45, eurCpiIndex: 101.5 },
  { id: "2025-06", depositRate: 5.8, cpiIndex: 104.0, eurDepositRate: 1.4, eurCpiIndex: 101.67 },
  // electricity price-cap removal (RON only); euro-area HICP stays ~2%
  { id: "2025-07", depositRate: 5.9, cpiIndex: 107.1, eurDepositRate: 1.38, eurCpiIndex: 101.83 },
  // VAT hike (RON only)
  { id: "2025-08", depositRate: 6.0, cpiIndex: 109.3, eurDepositRate: 1.35, eurCpiIndex: 102.0 },
  { id: "2025-09", depositRate: 6.0, cpiIndex: 109.8, eurDepositRate: 1.33, eurCpiIndex: 102.18 },
  { id: "2025-10", depositRate: 5.9, cpiIndex: 110.4, eurDepositRate: 1.3, eurCpiIndex: 102.35 },
  { id: "2025-11", depositRate: 5.8, cpiIndex: 110.9, eurDepositRate: 1.28, eurCpiIndex: 102.53 },
  { id: "2025-12", depositRate: 5.7, cpiIndex: 111.5, eurDepositRate: 1.25, eurCpiIndex: 102.7 },
  // 2026 — euro-area HICP picks up on energy base effects into spring
  { id: "2026-01", depositRate: 5.6, cpiIndex: 112.0, eurDepositRate: 1.22, eurCpiIndex: 102.85 },
  { id: "2026-02", depositRate: 5.5, cpiIndex: 112.4, eurDepositRate: 1.2, eurCpiIndex: 103.05 },
  { id: "2026-03", depositRate: 5.4, cpiIndex: 112.8, eurDepositRate: 1.18, eurCpiIndex: 103.55 },
  { id: "2026-04", depositRate: 5.4, cpiIndex: 113.2, eurDepositRate: 1.2, eurCpiIndex: 104.1 },
  { id: "2026-05", depositRate: 5.3, cpiIndex: 113.6, eurDepositRate: 1.2, eurCpiIndex: 104.55 },
  { id: "2026-06", depositRate: 5.3, cpiIndex: 114.0, eurDepositRate: 1.18, eurCpiIndex: 104.8 },
  { id: "2026-07", depositRate: 5.2, cpiIndex: 114.4, eurDepositRate: 1.15, eurCpiIndex: 105.0 },
];
