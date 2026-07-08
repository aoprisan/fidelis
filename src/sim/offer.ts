/**
 * Forward "current-offer" earnings model — the clean Plan tab (`#view-plan`),
 * distinct from both the historic backtester (`simulate.ts`) and the rolling
 * contribution planner (`planner.ts`).
 *
 * You subscribe TODAY to the most recent Fidelis edition and hold to maturity.
 * Two approaches, one core:
 *  - `single`: one lump into ONE chosen tranche (a maturity, or the blood-donor
 *    tranche in RON).
 *  - `ladder`: the lump split across several maturities by adjustable weights,
 *    staggering when capital comes back.
 *
 * Coupons are annual, fixed, tax-free and PAID OUT (not reinvested — future
 * editions' rates are unknown, so compounding would be a guess); principal
 * returns whole at each rung's maturity. The headline return is the
 * money-weighted IRR of the resulting cash-flow, which for a single par tranche
 * collapses exactly to its coupon rate.
 *
 * Pure, deterministic, DOM-free: it reads only `data/` + `sim/history.ts` and
 * the shared `irr` from `planner.ts`. It never imports from `ui/`.
 */

import { HISTORY, type Currency, type Issuance } from "../data/history";
import { idToYear } from "./history";
import { irr } from "./planner";

/** The two ways to model the current offer. */
export type OfferMode = "single" | "ladder";

/**
 * Typical minimum subscription per order, by currency and tranche. The
 * blood-donor RON tranche keeps the reduced "prag minim 500 lei"; everything
 * else follows the program's usual floor. Informational — the model never
 * blocks on it, it only flags a rung that lands below.
 */
export const MIN_SUB: Readonly<Record<Currency, { standard: number; donor: number }>> = {
  RON: { standard: 5000, donor: 500 },
  EUR: { standard: 1000, donor: 1000 },
};

/** One subscribable tranche in the current offer. */
export interface OfferTranche {
  /** Stable id within an offer, e.g. `"4"` or `"2d"` (donor). */
  readonly key: string;
  readonly mat: number;
  readonly rate: number;
  readonly donor: boolean;
  /** Romanian face label, e.g. `"4 ani"` or `"Donator · 2 ani"`. */
  readonly label: string;
  /** Typical minimum subscription for this tranche, in the offer currency. */
  readonly minSub: number;
}

/** The most recent Fidelis edition — the "current offer". */
export function currentOffer(): Issuance {
  return HISTORY[HISTORY.length - 1];
}

const trancheKey = (mat: number, donor: boolean): string => `${mat}${donor ? "d" : ""}`;

/**
 * The tranches on offer for a currency at a given edition: every standard
 * maturity, ascending, plus the blood-donor tranche when present (RON always,
 * EUR only when that edition published one). Donor is appended last.
 */
export function offerTranches(ccy: Currency, h: Issuance = currentOffer()): OfferTranche[] {
  const min = MIN_SUB[ccy];
  const table = ccy === "EUR" ? h.eur : h.maturities;
  const out: OfferTranche[] = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((mat) => ({
      key: trancheKey(mat, false),
      mat,
      rate: table[mat],
      donor: false,
      label: `${mat} ani`,
      minSub: min.standard,
    }));

  const donorRate = ccy === "EUR" ? h.donorRateEur : h.donorRate ?? undefined;
  const donorMat = ccy === "EUR" ? h.donorMaturityEur : h.donorMaturity ?? undefined;
  if (donorRate != null && donorMat != null) {
    out.push({
      key: trancheKey(donorMat, true),
      mat: donorMat,
      rate: donorRate,
      donor: true,
      label: `Donator · ${donorMat} ani`,
      minSub: min.donor,
    });
  }
  return out;
}

/** Pure inputs to an offer run. */
export interface OfferParams {
  readonly currency: Currency;
  /** Total amount subscribed today (offer currency). */
  readonly amount: number;
  readonly mode: OfferMode;
  /** `single` mode: the chosen tranche key (defaults to the first standard rung). */
  readonly pick?: string;
  /**
   * `ladder` mode: relative weight per tranche key. Arbitrary non-negative
   * numbers — they are normalised to the total. Keys absent or ≤ 0 are omitted.
   */
  readonly weights?: Readonly<Record<string, number>>;
}

/** One capital return on the calendar (coupon or principal), all positive. */
export interface OfferFlow {
  /** Whole years from subscription (anniversary). */
  readonly t: number;
  /** Absolute decimal year of the event. */
  readonly year: number;
  readonly kind: "coupon" | "principal";
  readonly amount: number;
  readonly fromKey: string;
  readonly mat: number;
  readonly rate: number;
}

/** One rung of the plan (the whole plan for `single`). */
export interface Rung {
  readonly key: string;
  readonly mat: number;
  readonly rate: number;
  readonly donor: boolean;
  readonly label: string;
  /** Effective share of the total after normalisation, %. */
  readonly weightPct: number;
  readonly principal: number;
  readonly annualCoupon: number;
  /** Coupons over the whole life (paid out, not compounded). */
  readonly totalInterest: number;
  /** Principal + total interest returned by this rung. */
  readonly maturityValue: number;
  /** True when this rung's principal is under its typical minimum subscription. */
  readonly belowMin: boolean;
}

/** The result of an offer run. */
export interface OfferResult {
  readonly currency: Currency;
  readonly offerId: string;
  readonly offerLabel: string;
  readonly offerYear: number;
  readonly invested: number;
  readonly rungs: Rung[];
  /** Coupon + principal calendar, chronological. */
  readonly flows: OfferFlow[];
  /** Total coupons across the whole plan. */
  readonly totalInterest: number;
  /** Invested + total interest (everything returned by the horizon). */
  readonly finalValue: number;
  /** Money-weighted annualised return (IRR) of the plan, %. */
  readonly yieldPct: number;
  /** Principal-weighted average coupon, %. */
  readonly avgCoupon: number;
  /** Longest rung maturity — the plan horizon, in years. */
  readonly horizonYears: number;
}

/** Resolve which tranches (and principals) a plan buys. */
function rungsFor(p: OfferParams, tranches: OfferTranche[]): Rung[] {
  const byKey = new Map(tranches.map((t) => [t.key, t]));

  const alloc: Array<{ t: OfferTranche; principal: number; weightPct: number }> = [];
  if (p.mode === "single") {
    const t = byKey.get(p.pick ?? "") ?? tranches[0];
    alloc.push({ t, principal: p.amount, weightPct: 100 });
  } else {
    const entries = tranches
      .map((t) => ({ t, w: Math.max(0, p.weights?.[t.key] ?? 0) }))
      .filter((e) => e.w > 0);
    const total = entries.reduce((s, e) => s + e.w, 0);
    // No positive weight → fall back to an equal split across the standard rungs.
    const use =
      total > 0
        ? entries
        : tranches.filter((t) => !t.donor).map((t) => ({ t, w: 1 }));
    const sum = use.reduce((s, e) => s + e.w, 0) || 1;
    for (const e of use) {
      const share = e.w / sum;
      alloc.push({ t: e.t, principal: p.amount * share, weightPct: share * 100 });
    }
  }

  return alloc.map(({ t, principal, weightPct }) => {
    const annualCoupon = (principal * t.rate) / 100;
    const totalInterest = annualCoupon * t.mat;
    return {
      key: t.key,
      mat: t.mat,
      rate: t.rate,
      donor: t.donor,
      label: t.label,
      weightPct,
      principal,
      annualCoupon,
      totalInterest,
      maturityValue: principal + totalInterest,
      belowMin: principal > 0 && principal < t.minSub,
    };
  });
}

/**
 * Model the current-offer plan: allocate the lump, book every annual coupon and
 * each rung's principal return, then value the whole thing money-weighted.
 */
export function computeOffer(p: OfferParams): OfferResult {
  const h = currentOffer();
  const offerYear = idToYear(h.id);
  const tranches = offerTranches(p.currency, h);
  const rungs = rungsFor(p, tranches);

  const flows: OfferFlow[] = [];
  for (const r of rungs) {
    for (let t = 1; t <= r.mat; t++) {
      flows.push({
        t, year: offerYear + t, kind: "coupon",
        amount: r.annualCoupon, fromKey: r.key, mat: r.mat, rate: r.rate,
      });
    }
    flows.push({
      t: r.mat, year: offerYear + r.mat, kind: "principal",
      amount: r.principal, fromKey: r.key, mat: r.mat, rate: r.rate,
    });
  }
  // Chronological; within a year coupons precede the principal return.
  flows.sort((a, b) => a.t - b.t || (a.kind === b.kind ? 0 : a.kind === "coupon" ? -1 : 1));

  const invested = rungs.reduce((s, r) => s + r.principal, 0);
  const totalInterest = rungs.reduce((s, r) => s + r.totalInterest, 0);
  const avgCoupon = invested > 0 ? rungs.reduce((s, r) => s + r.principal * r.rate, 0) / invested : 0;
  const horizonYears = rungs.reduce((m, r) => Math.max(m, r.mat), 0);

  const cash = [{ t: 0, amount: -invested }, ...flows.map((f) => ({ t: f.t, amount: f.amount }))];

  return {
    currency: p.currency,
    offerId: h.id,
    offerLabel: h.label,
    offerYear,
    invested,
    rungs,
    flows,
    totalInterest,
    finalValue: invested + totalInterest,
    yieldPct: invested > 0 ? irr(cash) : 0,
    avgCoupon,
    horizonYears,
  };
}

/**
 * Wealth over time for the growth chart: principal is always yours (held, then
 * returned as cash), so total wealth rises only as coupons are paid out — from
 * `invested` at subscription to `finalValue` at the horizon. One point per
 * anniversary year.
 */
export function wealthCurve(res: OfferResult): Array<{ t: number; value: number }> {
  const pts: Array<{ t: number; value: number }> = [{ t: 0, value: res.invested }];
  let acc = res.invested;
  for (let y = 1; y <= res.horizonYears; y++) {
    for (const f of res.flows) if (f.kind === "coupon" && f.t === y) acc += f.amount;
    pts.push({ t: y, value: acc });
  }
  return pts;
}
