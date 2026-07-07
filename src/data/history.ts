/**
 * REAL Fidelis rate history (RON + EUR tranches), Feb 2024 – Jul 2026.
 *
 * Every row is transcribed from the Ministry of Finance (Ministerul Finanțelor)
 * PRIMARY communiqué for that issuance — the official "comunicat de presă" that
 * announces the edition's final coupons (which, for Fidelis, are the coupons that
 * the corresponding "Termeni Finali" / OMF order then formalises). Each row's
 * `sourceUrl` links to that primary document. Rates are annual fixed coupons, in %,
 * tax-free. `subscriptionWindow` is the official offer period ("perioada de ofertă").
 *
 * Cross-checks performed:
 *  - Press-release offer windows match the OMF "Termeni Finali" orders where both
 *    exist (e.g. Oct 2025 press = OMF 1656; Nov = OMF 1819; Dec = OMF 1937).
 *  - Where an MF press release could NOT be located, the row is marked
 *    `unverified: true` and sourced to the best available document — see FLAGS.
 *
 * FLAGS (cells NOT confirmed to a primary MF document — never invented, sourced to
 * agreeing secondary coverage pending an OMF read):
 *  - 2026-02: rates from MF-derived secondary coverage; a primary OMF exists
 *    (OMF 119 / 06.02.2026) but was not machine-readable here. 5y EUR not stated
 *    in the coverage → omitted rather than guessed.
 *  - 2026-03: rates from secondary coverage; primary OMF not read.
 *  - 2026-07: rates from Agerpres/broker coverage of the MF launch; primary OMF
 *    (early Jul 2026) not read.
 *
 * Structure changes captured here (previously mis-encoded):
 *  - 2024: Feb/Apr/Jun = 1y+3y RON; Aug/Oct = 1y+5y; Dec = 1y+5y (+ 3y donor).
 *  - Mid-2025: 1/3/5y RON → 2/4/6y RON (from Jun 2025); EUR gained a 5y (Jun) then
 *    a 10y (Aug 2025), and EUR 2y → 3y from Oct 2025.
 *  - Mid-2026: RON 6y → 10y (from Jun 2026).
 *
 * NOTE: verify the official final terms on `sourceUrl` before subscribing.
 */

/** Currency a tranche is denominated in. Donor tranches exist only for RON. */
export type Currency = "RON" | "EUR";

/** Official Ministry of Finance program page for Fidelis government bonds. */
export const MF_SOURCE =
  "https://mfinante.gov.ro/ro/web/trezor/titluri-de-stat-fidelis";

/** A single Fidelis issuance (one per issuance month). */
export interface Issuance {
  /** Issuance id, `YYYY-MM`. Lexical order == chronological order. */
  readonly id: string;
  /** Human-readable label, e.g. "Feb 2025". */
  readonly label: string;
  /** Official subscription window, ISO date range `YYYY-MM-DD/YYYY-MM-DD`. */
  readonly subscriptionWindow: string;
  /** RON tranches: maturity (years) -> annual fixed coupon (%). */
  readonly maturities: Readonly<Record<number, number>>;
  /** EUR tranches: maturity (years) -> annual fixed coupon (%). */
  readonly eur: Readonly<Record<number, number>>;
  /** Blood-donor RON tranche coupon (%), or null if that issuance had none. */
  readonly donorRate: number | null;
  /** Maturity (years) of the blood-donor RON tranche, or null. */
  readonly donorMaturity: number | null;
  /** Primary MF source URL for this issuance's terms. */
  readonly sourceUrl: string;
  /** True when a cell could NOT be confirmed to a primary MF document. */
  readonly unverified?: true;
  /** Extra primary detail not expressible in the fields above (e.g. a second donor tranche). */
  readonly notes?: string;
}

// Base of the MF "comunicate de presă" asset-publisher path (rows append their slug).
const P =
  "https://mfinante.gov.ro/ro/acasa/-/asset_publisher/uwgr/content/";

export const HISTORY: readonly Issuance[] = [
  // ── 2024 ──────────────────────────────────────────────────────────────────
  {
    id: "2024-02",
    label: "Feb 2024",
    subscriptionWindow: "2024-02-21/2024-03-01",
    maturities: { 1: 6.0, 3: 6.75 },
    eur: { 1: 4.0, 5: 5.0 },
    donorRate: 7.0,
    donorMaturity: 1,
    sourceUrl:
      P +
      "-e2-80-9erom-c3-a2nia-are-s-c3-a2nge-de-rocker-c8-99i-c3-aen-2024.-din-21-februarie-c3-aencepe-o-nou-c4-83-edi-c8-9bie-a-programului-de-titluri-de-stat-fidelis-cu-cea-mai-bun-c4-83-dob-c3-a2nd-c4-83-pentru-donatori",
    notes: "1st edition of 2024 (min. Boloș).",
  },
  {
    id: "2024-04",
    label: "Apr 2024",
    subscriptionWindow: "2024-04-08/2024-04-17",
    maturities: { 1: 6.0, 3: 6.85 },
    eur: { 1: 4.0, 5: 5.0 },
    donorRate: 7.0,
    donorMaturity: 1,
    sourceUrl:
      P +
      "ministerul-finan-c8-9belor-lanseaz-c4-83-o-nou-c4-83-edi-c8-9bie-fidelis-c3-aentre-8-17-aprilie.-donatorii-de-s-c3-a2nge-primesc-c3-aen-continuare-cea-mai-bun-c4-83-dob-c3-a2nd-c4-83",
  },
  {
    id: "2024-06",
    label: "Jun 2024",
    subscriptionWindow: "2024-06-18/2024-06-28",
    maturities: { 1: 6.0, 3: 6.85 },
    eur: { 1: 4.0, 5: 5.0 },
    donorRate: 7.0,
    donorMaturity: 1,
    sourceUrl:
      P +
      "ministerul-finan-c8-9belor-lanseaz-c4-83-mar-c8-9bi-18-iunie-o-nou-c4-83-emisiune-fidelis-de-titluri-de-stat-pentru-popula-c8-9bie.-peste-10.000-de-vie-c8-9bi-salvate-c3-aen-2024-prin-campania-de-donare-a-programului-fidelis",
    notes: "3rd edition; MF raised cadence from 4 to 6 editions/year.",
  },
  {
    id: "2024-08",
    label: "Aug 2024",
    subscriptionWindow: "2024-08-08/2024-08-20",
    maturities: { 1: 5.8, 5: 7.0 },
    eur: { 1: 4.0, 5: 5.0 },
    donorRate: 6.8,
    donorMaturity: 1,
    sourceUrl:
      P +
      "mf-lanseaz-c4-83-o-nou-c4-83-edi-c8-9bie-de-titluri-de-stat-fidelis-c3-aen-care-donatorii-de-s-c3-a2nge-au-condi-c8-9bii-speciale",
  },
  {
    id: "2024-10",
    label: "Oct 2024",
    subscriptionWindow: "2024-10-02/2024-10-11",
    maturities: { 1: 5.85, 5: 7.0 },
    eur: { 1: 3.95, 5: 5.0 },
    donorRate: 6.85,
    donorMaturity: 1,
    sourceUrl:
      P +
      "a-cincea-emisiune-fidelis-din-2024-se-lanseaz-c4-83-miercuri-2-octombrie-o-nou-c4-83-tran-c8-99-c4-83-special-c4-83-dedicat-c4-83-donatorilor-de-s-c3-a2nge",
  },
  {
    id: "2024-12",
    label: "Dec 2024",
    subscriptionWindow: "2024-12-09/2024-12-18",
    maturities: { 1: 6.45, 5: 7.6 },
    eur: { 2: 3.75, 7: 5.75 },
    donorRate: 7.45,
    donorMaturity: 1,
    sourceUrl:
      P +
      "fidelis-de-iarn-c4-83-din-9-decembrie-donatorii-de-s-c3-a2nge-vor-avea-o-dob-c3-a2nd-c4-83-de-p-c3-a2n-c4-83-la-7-9-pe-an",
    notes:
      "Two donor tranches: 1y @ 7.45 (here) and, in premiere, 3y @ 7.90. EUR maturities changed to 2y/7y.",
  },

  // ── 2025 ──────────────────────────────────────────────────────────────────
  {
    id: "2025-02",
    label: "Feb 2025",
    subscriptionWindow: "2025-02-07/2025-02-14",
    maturities: { 1: 6.95, 3: 7.65, 5: 7.95 },
    eur: { 2: 4.0, 7: 6.25 },
    donorRate: 7.95,
    donorMaturity: 1,
    sourceUrl:
      P +
      "fidelis-debuteaz-c4-83-c3-aen-anul-2025-cu-dob-c3-a2nzi-de-p-c3-a2n-c4-83-la-7-95-",
    notes: "1st edition of 2025; program went monthly.",
  },
  {
    id: "2025-03",
    label: "Mar 2025",
    subscriptionWindow: "2025-03-07/2025-03-14",
    maturities: { 1: 6.8, 3: 7.5, 5: 7.8 },
    eur: { 2: 3.75, 7: 6.0 },
    donorRate: 7.8,
    donorMaturity: 1,
    sourceUrl: P + "fidelis-de-martie-dob-c3-a2nzi-de-p-c3-a2n-c4-83-la-7-8-",
  },
  {
    id: "2025-04",
    label: "Apr 2025",
    subscriptionWindow: "2025-04-04/2025-04-11",
    maturities: { 1: 6.6, 3: 7.3, 5: 7.6 },
    eur: { 2: 3.6, 7: 6.0 },
    donorRate: 7.6,
    donorMaturity: 1,
    sourceUrl:
      P +
      "fidelis-de-aprilie-donatorii-de-s-c3-a2nge-vor-avea-o-dob-c3-a2nd-c4-83-de-7-6-",
  },
  {
    id: "2025-05",
    label: "May 2025",
    subscriptionWindow: "2025-05-09/2025-05-16",
    maturities: { 1: 6.75, 3: 7.4, 5: 7.8 },
    eur: { 2: 3.85, 7: 6.25 },
    donorRate: 7.75,
    donorMaturity: 1,
    sourceUrl:
      P +
      "din-9-mai-mf-lanseaz-c4-83-a-patra-edi-c8-9bie-fidelis-din-2025-cu-dob-c3-a2nzi-de-p-c3-a2n-c4-83-la-7-80-",
  },
  {
    id: "2025-06",
    label: "Jun 2025",
    subscriptionWindow: "2025-06-06/2025-06-16",
    maturities: { 2: 7.35, 4: 7.7, 6: 7.95 },
    eur: { 2: 3.9, 5: 5.6, 7: 6.5 },
    donorRate: 8.35,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-v-din-2025-c3-aen-premier-c4-83-donatorii-de-s-c3-a2nge-pot-cump-c4-83ra-titluri-de-stat-cu-scaden-c8-9ba-la-2-ani-la-o-dob-c3-a2nd-c4-83-de-8-35-",
    notes: "RON switched to 2/4/6y; donor tranche moved to 2y; EUR gained a 5y.",
  },
  {
    id: "2025-07",
    label: "Jul 2025",
    subscriptionWindow: "2025-07-04/2025-07-11",
    maturities: { 2: 7.25, 4: 7.7, 6: 7.95 },
    eur: { 2: 3.4, 5: 5.5, 7: 6.3 },
    donorRate: 8.25,
    donorMaturity: 2,
    sourceUrl:
      P +
      "mf-lanseaz-c4-83-a-c8-99asea-edi-c8-9bie-fidelis-din-2025-cu-dob-c3-a2nzi-de-p-c3-a2n-c4-83-la-8-25-",
    notes: "Added a EUR donor tranche: 2y @ 4.40.",
  },
  {
    id: "2025-08",
    label: "Aug 2025",
    subscriptionWindow: "2025-08-01/2025-08-08",
    maturities: { 2: 7.2, 4: 7.65, 6: 7.9 },
    eur: { 2: 3.1, 5: 5.25, 10: 6.5 },
    donorRate: 8.2,
    donorMaturity: 2,
    sourceUrl:
      P +
      "o-premier-c4-83-important-c4-83-la-fidelis-vii-titluri-de-stat-pe-10-ani-denominate-c3-aen-euro",
    notes: "FIDELIS VII: 10y EUR premiere. EUR donor tranche: 2y @ 4.10.",
  },
  {
    id: "2025-09",
    label: "Sep 2025",
    subscriptionWindow: "2025-09-05/2025-09-12",
    maturities: { 2: 7.2, 4: 7.6, 6: 7.9 },
    eur: { 2: 3.1, 5: 5.25, 10: 6.5 },
    donorRate: 8.2,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-de-septembrie-titluri-de-stat-c3-aen-lei-c8-99i-euro-cu-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-8-20-",
    notes: "EUR donor tranche: 2y @ 4.10.",
  },
  {
    id: "2025-10",
    label: "Oct 2025",
    subscriptionWindow: "2025-10-10/2025-10-17",
    maturities: { 2: 7.2, 4: 7.6, 6: 7.9 },
    eur: { 3: 4.15, 5: 5.25, 10: 6.5 },
    donorRate: 8.2,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-de-octombrie-titluri-de-stat-c3-aen-lei-c8-99i-euro-cu-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-8-20-",
    notes: "Cross-checked vs OMF 1656/08.10.2025 (issued 22.10.2025). EUR 2y → 3y.",
  },
  {
    id: "2025-11",
    label: "Nov 2025",
    subscriptionWindow: "2025-11-07/2025-11-14",
    maturities: { 2: 6.95, 4: 7.35, 6: 7.7 },
    eur: { 3: 3.9, 5: 5.0, 10: 6.3 },
    donorRate: 7.95,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-de-noiembrie-ofer-c4-83-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-7-95-",
    notes: "Cross-checked vs OMF 1819 (noiembrie 2025).",
  },
  {
    id: "2025-12",
    label: "Dec 2025",
    subscriptionWindow: "2025-12-05/2025-12-12",
    maturities: { 2: 6.55, 4: 7.1, 6: 7.5 },
    eur: { 3: 3.75, 5: 4.75, 10: 6.2 },
    donorRate: 7.55,
    donorMaturity: 2,
    sourceUrl:
      P +
      "ministerul-finan-c8-9belor-lanseaz-c4-83-ultima-edi-c8-9bie-fidelis-din-2025-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-7-55-c3-aen-lei-c8-99i-6-20-c3-aen-euro",
    notes: "Last 2025 edition (FIDELIS XI). Cross-checked vs OMF 1937/04.12.2025.",
  },

  // ── 2026 ──────────────────────────────────────────────────────────────────
  {
    id: "2026-01",
    label: "Jan 2026",
    subscriptionWindow: "2026-01-16/2026-01-23",
    maturities: { 2: 6.45, 4: 7.1, 6: 7.5 },
    eur: { 3: 3.75, 5: 4.75, 10: 6.2 },
    donorRate: 7.45,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-debuteaz-c4-83-c3-aen-2026-cu-dob-c3-a2nzi-de-p-c3-a2n-c4-83-la-7-50-",
  },
  {
    id: "2026-02",
    label: "Feb 2026",
    subscriptionWindow: "2026-02-06/2026-02-13",
    maturities: { 2: 6.15, 4: 6.75, 6: 7.25 },
    eur: { 3: 3.6, 10: 6.0 },
    donorRate: 7.15,
    donorMaturity: 2,
    sourceUrl:
      "https://mfinante.gov.ro/static/10/Mfp/resurse/trezorerie/OMF119_06022026.pdf",
    unverified: true,
    notes:
      "FLAG: rates from agreeing MF-derived secondary coverage; not cross-read against the primary OMF 119/06.02.2026 (PDF not machine-readable here). 5y EUR coupon not stated in coverage → omitted, not guessed.",
  },
  {
    id: "2026-03",
    label: "Mar 2026",
    subscriptionWindow: "2026-03-06/2026-03-13",
    maturities: { 2: 5.9, 4: 6.6, 6: 7.1 },
    eur: { 3: 3.5, 5: 4.5, 10: 6.0 },
    donorRate: 6.9,
    donorMaturity: 2,
    sourceUrl: MF_SOURCE,
    unverified: true,
    notes:
      "FLAG: MF press release not located; rates from agreeing secondary coverage (fidelis.ro / BZI / wall-street). Confirm against the March 2026 OMF order.",
  },
  {
    id: "2026-04",
    label: "Apr 2026",
    subscriptionWindow: "2026-04-14/2026-04-21",
    maturities: { 2: 6.6, 4: 7.1, 6: 7.6 },
    eur: { 3: 4.25, 5: 5.25, 10: 6.4 },
    donorRate: 7.6,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-de-aprilie-are-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-7-60-",
  },
  {
    id: "2026-05",
    label: "May 2026",
    subscriptionWindow: "2026-05-08/2026-05-15",
    maturities: { 2: 6.4, 4: 7.0, 6: 7.5 },
    eur: { 3: 4.0, 5: 5.0, 10: 6.25 },
    donorRate: 7.4,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-vine-c3-aen-luna-mai-cu-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-7-50-",
  },
  {
    id: "2026-06",
    label: "Jun 2026",
    subscriptionWindow: "2026-06-15/2026-06-22",
    maturities: { 2: 6.35, 4: 6.9, 10: 7.6 },
    eur: { 3: 4.0, 5: 4.85, 10: 5.8 },
    donorRate: 7.35,
    donorMaturity: 2,
    sourceUrl:
      P +
      "fidelis-aduce-c3-aen-luna-iunie-dob-c3-a2nzi-neimpozabile-de-p-c3-a2n-c4-83-la-7-60-c8-99i-dou-c4-83-tran-c8-99e-speciale-dedicate-donatorilor-de-s-c3-a2nge",
    notes: "RON 6y → 10y. Added a EUR donor tranche: 10y @ 6.80.",
  },
  {
    id: "2026-07",
    label: "Jul 2026",
    subscriptionWindow: "2026-07-03/2026-07-10",
    maturities: { 2: 6.3, 4: 6.85, 10: 7.55 },
    eur: { 3: 3.9, 5: 4.8, 10: 6.2 },
    donorRate: 7.3,
    donorMaturity: 2,
    sourceUrl:
      "https://agerpres.ro/economic/2026/07/01/ministerul-finantelor-lanseaza-o-noua-editie-fidelis-cu-dobanzi-de-pana-la-7-55-la-lei-si-6-20-la-eu--1572226",
    unverified: true,
    notes:
      "FLAG: MF press release URL not located; rates from Agerpres coverage of the MF launch, corroborated by BCR/BT. Confirm against the July 2026 OMF order.",
  },
];

/** Simulation horizon: mid-2026, expressed in decimal years. */
export const END = 2026 + 7 / 12;
