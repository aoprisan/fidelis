/**
 * Clean Fidelis earnings model for the Plan tab (`#view-plan`), distinct from
 * the historic backtester (`simulate.ts`) and the rolling planner (`planner.ts`).
 *
 * You subscribe to ONE edition — the current offer or any past one — either once
 * or as a recurring contribution in every edition from the start onward. Each
 * contribution buys a single tranche or a weighted ladder across the edition's
 * maturities. Coupons are annual, fixed, tax-free and PAID OUT (no reinvestment
 * assumption — future editions' rates are unknown); each rung is held to ITS OWN
 * maturity (no rolling into longer bonds). The plan is valued two ways:
 *  - `maturity`: hold every rung to term — the full forward total;
 *  - `now`: mark to today (`END`) — "where would I be now", coupons collected so
 *    far plus the current worth of still-running bonds.
 *
 * The headline return is the money-weighted IRR of the actual cash-flow, so a
 * single par tranche reads its coupon rate exactly, and a recurring plan is
 * annualised correctly across its staggered contributions.
 *
 * Pure, deterministic, DOM-free: reads only `data/` + `sim/history.ts` and the
 * shared `irr` from `planner.ts`. It never imports from `ui/` and never touches
 * the golden-guarded backtester.
 */

import { END, HISTORY, type Currency, type Issuance } from "../data/history";
import { idToYear, matsAt } from "./history";
import { irr } from "./planner";

/** Single tranche vs a weighted ladder. */
export type OfferMode = "single" | "ladder";
/** One contribution vs the same amount in every edition from the start on. */
export type OfferContrib = "once" | "monthly";
/** Hold every rung to term, or mark the plan to today. */
export type OfferHorizon = "maturity" | "now";

/**
 * A ladder position. Editions carry two or three standard maturities; we address
 * them by rank so a plan generalises across the mid-2025 maturity switch and a
 * recurring range that spans different tranche sets. `donor` is the RON (or, when
 * an edition offers it, EUR) blood-donor tranche.
 */
export type Slot = "short" | "mid" | "long" | "donor";

/** Typical minimum subscription per order, by currency and tranche. */
export const MIN_SUB: Readonly<Record<Currency, { standard: number; donor: number }>> = {
  RON: { standard: 5000, donor: 500 },
  EUR: { standard: 1000, donor: 1000 },
};

/** The most recent Fidelis edition — the "current offer". */
export function currentOffer(): Issuance {
  return HISTORY[HISTORY.length - 1];
}

/** One resolved tranche within an edition. */
export interface OfferRung {
  slot: Slot;
  mat: number;
  rate: number;
  donor: boolean;
  /** Romanian face label, e.g. `"4 ani"` or `"Donator · 2 ani"`. */
  label: string;
  minSub: number;
}

const SLOT_LABEL: Record<Exclude<Slot, "donor">, string> = {
  short: "Scurtă",
  mid: "Medie",
  long: "Lungă",
};

/**
 * The rungs on offer at an edition for a currency, addressed by rank: the
 * shortest maturity, the longest, the middle one when three or more exist, and
 * the blood-donor tranche when present. Ascending by maturity, donor last.
 */
export function editionRungs(id: string, ccy: Currency): OfferRung[] {
  const h = HISTORY.find((x) => x.id === id) ?? currentOffer();
  const table = ccy === "EUR" ? h.eur : h.maturities;
  const min = MIN_SUB[ccy];
  const mats = matsAt(id, ccy);
  const rung = (slot: Slot, mat: number): OfferRung => ({
    slot,
    mat,
    rate: table[mat],
    donor: false,
    label: `${mat} ani`,
    minSub: min.standard,
  });

  const out: OfferRung[] = [rung("short", mats[0])];
  if (mats.length >= 3) out.push(rung("mid", mats[Math.floor(mats.length / 2)]));
  if (mats.length >= 2) out.push(rung("long", mats[mats.length - 1]));

  const donorRate = ccy === "EUR" ? h.donorRateEur : h.donorRate ?? undefined;
  const donorMat = ccy === "EUR" ? h.donorMaturityEur : h.donorMaturity ?? undefined;
  if (donorRate != null && donorMat != null) {
    out.push({
      slot: "donor",
      mat: donorMat,
      rate: donorRate,
      donor: true,
      label: `Donator · ${donorMat} ani`,
      minSub: min.donor,
    });
  }
  return out;
}

/** A friendly ladder-slot label, annotated with the start edition's maturity. */
export function slotLabel(slot: Slot, mat: number): string {
  return slot === "donor" ? `Donator · ${mat} ani` : `${SLOT_LABEL[slot]} · ${mat} ani`;
}

/** Pure inputs to an offer run. */
export interface OfferParams {
  readonly currency: Currency;
  /** Amount per contribution (offer currency). */
  readonly amount: number;
  readonly mode: OfferMode;
  /** Start edition id; defaults to the current offer. */
  readonly startId?: string;
  /** One contribution, or one per edition from the start onward. */
  readonly contrib?: OfferContrib;
  /** Valuation basis; defaults to `maturity`. */
  readonly horizon?: OfferHorizon;
  /** `single` mode: which ladder slot to buy (defaults to the longest). */
  readonly pick?: Slot;
  /** `ladder` mode: relative weight per slot; normalised, keys ≤ 0 omitted. */
  readonly weights?: Readonly<Partial<Record<Slot, number>>>;
}

/** One rung bought by one contribution. */
export interface Alloc {
  contribId: string;
  contribLabel: string;
  buyYear: number;
  slot: Slot;
  mat: number;
  rate: number;
  donor: boolean;
  label: string;
  /** Effective share of that contribution, %. */
  weightPct: number;
  principal: number;
  couponAnnual: number;
  /** Whole coupons realised by the valuation horizon. */
  couponsPaid: number;
  /** True once this rung has returned its principal by the horizon. */
  matured: boolean;
  belowMin: boolean;
  /** This rung's contribution to the plan's horizon value. */
  valueAtHorizon: number;
}

/** One capital return on the calendar (coupon or principal), all positive. */
export interface OfferFlow {
  /** Absolute decimal year of the event. */
  year: number;
  kind: "coupon" | "principal";
  amount: number;
  slot: Slot;
  mat: number;
  donor: boolean;
}

/** The result of an offer run. */
export interface OfferResult {
  currency: Currency;
  startId: string;
  startLabel: string;
  latestLabel: string;
  contrib: OfferContrib;
  horizon: OfferHorizon;
  /** Number of contribution editions. */
  contributions: number;
  allocs: Alloc[];
  /** Coupon + principal calendar, chronological. */
  flows: OfferFlow[];
  invested: number;
  totalInterest: number;
  finalValue: number;
  /** Money-weighted annualised return (IRR), %. */
  yieldPct: number;
  /** Principal-weighted average coupon, %. */
  avgCoupon: number;
  /** First contribution year → the valuation horizon, in years. */
  years: number;
  startYear: number;
  horizonYear: number;
}

/** The editions a plan contributes in: just the start, or every edition onward. */
export function contributionIds(startId: string, contrib: OfferContrib): string[] {
  if (contrib !== "monthly") return [startId];
  return HISTORY.filter((h) => h.id >= startId).map((h) => h.id);
}

/** Resolve which rungs (and principals) one contribution buys at an edition. */
function allocateContribution(
  p: OfferParams,
  rungs: OfferRung[],
): Array<{ rung: OfferRung; principal: number; weightPct: number }> {
  if (p.mode === "single") {
    const want = p.pick ?? "long";
    const rung =
      rungs.find((r) => r.slot === want) ??
      rungs.find((r) => r.slot === "long") ??
      rungs[rungs.length - 1];
    return [{ rung, principal: p.amount, weightPct: 100 }];
  }
  const weighted = rungs
    .map((r) => ({ rung: r, w: Math.max(0, p.weights?.[r.slot] ?? 0) }))
    .filter((e) => e.w > 0);
  // No positive weight → equal split across the standard rungs.
  const use =
    weighted.length > 0
      ? weighted
      : rungs.filter((r) => r.slot !== "donor").map((r) => ({ rung: r, w: 1 }));
  const sum = use.reduce((s, e) => s + e.w, 0) || 1;
  return use.map((e) => ({
    rung: e.rung,
    principal: p.amount * (e.w / sum),
    weightPct: (e.w / sum) * 100,
  }));
}

/** Value one rung at the horizon and record its realised coupons. */
function valueRung(
  buyYear: number,
  principal: number,
  rate: number,
  mat: number,
  horizon: OfferHorizon,
): { couponsPaid: number; matured: boolean; valueAtHorizon: number } {
  const couponAnnual = (principal * rate) / 100;
  if (horizon === "maturity") {
    return { couponsPaid: mat, matured: true, valueAtHorizon: principal + couponAnnual * mat };
  }
  // "now": mark to END.
  const elapsed = Math.max(0, END - buyYear);
  const couponsPaid = Math.max(0, Math.min(mat, Math.floor(elapsed + 1e-9)));
  const matured = buyYear + mat <= END + 1e-9;
  const received = couponAnnual * couponsPaid;
  const holding = matured
    ? principal
    : principal + couponAnnual * (elapsed - couponsPaid); // + accrued partial coupon
  return { couponsPaid, matured, valueAtHorizon: received + holding };
}

/**
 * Model the plan: for each contribution edition, allocate the amount across its
 * rungs, book every realised coupon and each matured principal, then value it
 * money-weighted at the chosen horizon.
 */
export function computeOffer(p: OfferParams): OfferResult {
  const startId = p.startId ?? currentOffer().id;
  const contrib = p.contrib ?? "once";
  const horizon = p.horizon ?? "maturity";
  const ids = contributionIds(startId, contrib);
  const startYear = idToYear(startId);

  const allocs: Alloc[] = [];
  const flows: OfferFlow[] = [];
  // IRR cash-flow times are RELATIVE to the start year (planner.irr wants t0 = 0).
  const cash: Array<{ t: number; amount: number }> = [];

  for (const id of ids) {
    const buyYear = idToYear(id);
    const rel = buyYear - startYear;
    const label = HISTORY.find((h) => h.id === id)!.label;
    const rungs = editionRungs(id, p.currency);
    for (const { rung, principal, weightPct } of allocateContribution(p, rungs)) {
      const couponAnnual = (principal * rung.rate) / 100;
      const { couponsPaid, matured, valueAtHorizon } = valueRung(
        buyYear, principal, rung.rate, rung.mat, horizon,
      );
      allocs.push({
        contribId: id, contribLabel: label, buyYear,
        slot: rung.slot, mat: rung.mat, rate: rung.rate, donor: rung.donor, label: rung.label,
        weightPct, principal, couponAnnual, couponsPaid, matured, valueAtHorizon,
        belowMin: principal > 0 && principal < rung.minSub,
      });

      cash.push({ t: rel, amount: -principal });
      for (let k = 1; k <= couponsPaid; k++) {
        flows.push({ year: buyYear + k, kind: "coupon", amount: couponAnnual, slot: rung.slot, mat: rung.mat, donor: rung.donor });
        cash.push({ t: rel + k, amount: couponAnnual });
      }
      if (matured) {
        flows.push({ year: buyYear + rung.mat, kind: "principal", amount: principal, slot: rung.slot, mat: rung.mat, donor: rung.donor });
        cash.push({ t: rel + rung.mat, amount: principal });
      } else if (horizon === "now") {
        // Residual worth of the still-running bond, valued at today.
        cash.push({ t: END - startYear, amount: valueAtHorizon - couponAnnual * couponsPaid });
      }
    }
  }

  flows.sort((a, b) => a.year - b.year || (a.kind === b.kind ? 0 : a.kind === "coupon" ? -1 : 1));

  const invested = allocs.reduce((s, a) => s + a.principal, 0);
  const finalValue = allocs.reduce((s, a) => s + a.valueAtHorizon, 0);
  const avgCoupon = invested > 0 ? allocs.reduce((s, a) => s + a.principal * a.rate, 0) / invested : 0;
  const horizonYear =
    horizon === "now" ? END : Math.max(startYear, ...allocs.map((a) => a.buyYear + a.mat));

  return {
    currency: p.currency,
    startId,
    startLabel: HISTORY.find((h) => h.id === startId)!.label,
    latestLabel: currentOffer().label,
    contrib,
    horizon,
    contributions: ids.length,
    allocs,
    flows,
    invested,
    totalInterest: finalValue - invested,
    finalValue,
    yieldPct: invested > 0 ? irr(cash) : 0,
    avgCoupon,
    years: Math.max(0, horizonYear - startYear),
    startYear,
    horizonYear,
  };
}

/**
 * Wealth over time for the growth chart: total worth = principal still held (or
 * returned as cash) plus coupons collected so far. Sampled once per year from
 * the first contribution to the horizon; each contribution steps the curve up
 * as fresh capital enters, and coupons lift it in between.
 */
export function wealthCurve(res: OfferResult): Array<{ t: number; value: number }> {
  // Sample at the start, every whole year in between, and the horizon.
  const times = new Set<number>([res.startYear, res.horizonYear]);
  for (let y = Math.ceil(res.startYear + 1e-9); y < res.horizonYear - 1e-9; y++) times.add(y);
  const pts: Array<{ t: number; value: number }> = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    let value = 0;
    for (const a of res.allocs) {
      if (t < a.buyYear - 1e-9) continue; // not yet invested
      const elapsed = t - a.buyYear;
      const coupons = Math.max(0, Math.min(a.mat, Math.floor(elapsed + 1e-9)));
      const received = a.couponAnnual * coupons;
      const matured = elapsed >= a.mat - 1e-9;
      const holding = matured ? a.principal : a.principal + a.couponAnnual * (elapsed - coupons);
      value += received + holding;
    }
    pts.push({ t, value });
  }
  return pts;
}
