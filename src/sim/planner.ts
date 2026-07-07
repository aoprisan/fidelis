import { HISTORY, type Currency, type Issuance } from "../data/history";
import { byId, couponFor, idToYear, matsAt } from "./history";

/**
 * Forward-looking ladder PLANNER — distinct from the historic backtester in
 * `simulate.ts`. Given a monthly contribution stream, a horizon and a risk
 * preference, it computes an optimal rolling Fidelis ladder: which tranche to
 * buy each month, the capital-return schedule (coupons + principal), the
 * auto-reinvest logic, and the blood-donor edge surfaced whenever it dominates.
 *
 * Like the backtester this layer is pure, deterministic and DOM-free — it only
 * reads `data/` and the `sim/history.ts` lookups, so the whole thing is a
 * unit-testable reducer. It never imports from `ui/`.
 *
 * Model (all cash is tax-free, coupons annual, held to maturity):
 *  - Each month a fresh contribution lands in a cash pool, together with any
 *    coupons/principal returned that month (when reinvesting).
 *  - The pool buys ONE tranche that month at the then-current issuance, picking
 *    the maturity dictated by `risk`. If the investor is a blood-donor and that
 *    edition's donor tranche pays MORE than the risk pick — and the pool clears
 *    the 500-RON donor minimum — the donor tranche is chosen instead.
 *  - Coupons and returned principal are reinvested (rolled into the pool) or
 *    withdrawn, per `reinvest`.
 */

export type Risk = "short" | "balanced" | "long";

/** Fidelis nominal minimum per order (RON). */
export const MIN_BUY = 100;
/** Blood-donor tranche minimum subscription (RON) — the "prag minim 500 lei". */
export const DONOR_MIN = 500;

/** Pure inputs to a plan run. */
export interface PlanParams {
  /** Fixed monthly contribution (RON). */
  monthly: number;
  /** Planning horizon in years. */
  horizonYears: number;
  /** First issuance month to start contributing (`YYYY-MM`). */
  startId: string;
  /** Maturity preference. */
  risk: Risk;
  /** Whether the investor qualifies for the blood-donor tranche. */
  donorEligible: boolean;
  /** Auto-reinvest matured capital + coupons into the current edition. */
  reinvest: boolean;
  /** Currency of the ladder (RON or EUR). Donor tranches apply to RON only. */
  currency: Currency;
}

/** One month's purchase — "which tranche to buy this month". */
export interface Purchase {
  /** Month index from start (0-based). */
  month: number;
  /** Decimal year of the purchase. */
  year: number;
  buyId: string;
  buyLabel: string;
  mat: number;
  rate: number;
  /** Principal invested (pooled cash). */
  amount: number;
  /** True when the donor tranche was chosen. */
  donor: boolean;
  /** pp advantage of the donor tranche over the risk pick, when it dominated. */
  donorEdge: number | null;
  maturesMonth: number;
  maturesYear: number;
}

export type ReturnKind = "coupon" | "principal";

/** One capital-return event on the schedule. */
export interface ReturnEvent {
  month: number;
  year: number;
  kind: ReturnKind;
  amount: number;
  fromId: string;
  fromLabel: string;
  /** Whether this return was rolled back into the ladder. */
  reinvested: boolean;
}

/** The result of a plan run. */
export interface PlanResult {
  /** One purchase per month a buy occurred (chronological). */
  purchases: Purchase[];
  /** Capital-return schedule (coupons + principal), chronological. */
  schedule: ReturnEvent[];
  /** Total fresh contributions over the horizon. */
  contributed: number;
  /** Total wealth at the horizon (holdings + returns), tax-free. */
  finalValue: number;
  profit: number;
  years: number;
  /** Money-weighted annualized return (IRR) of the contribution stream, %. */
  cagr: number;
  /** How many months the donor tranche dominated and was bought. */
  donorUsedCount: number;
  /** Mean pp edge across donor buys (0 if none). */
  donorAvgEdge: number;
  /** Months the donor tranche would have dominated but the pool was < 500 RON. */
  donorBlockedCount: number;
}

/** Pick a maturity from the available list per risk preference. */
export function pickMaturity(mats: number[], risk: Risk): number {
  if (risk === "short") return mats[0];
  if (risk === "long") return mats[mats.length - 1];
  return mats[Math.floor(mats.length / 2)];
}

/** The issuance whose terms are current in a given month (latest at/before). */
export function issuanceForMonth(year: number): Issuance {
  let chosen = HISTORY[0];
  for (const h of HISTORY) {
    if (idToYear(h.id) <= year + 1e-9) chosen = h;
    else break;
  }
  return chosen;
}

interface Choice {
  mat: number;
  rate: number;
  donor: boolean;
  donorEdge: number | null;
  /** Donor tranche would dominate, but the pool is below the 500-RON minimum. */
  blockedDonor: boolean;
}

/** Choose the tranche for this month's pool: risk pick, or donor if it dominates. */
function choose(
  id: string,
  risk: Risk,
  donorEligible: boolean,
  cash: number,
  ccy: Currency,
): Choice {
  const mats = matsAt(id, ccy);
  const base = couponFor(id, pickMaturity(mats, risk), false, ccy);
  const h = byId[id];
  // Donor tranches are RON-only.
  if (ccy === "RON" && donorEligible && h.donorRate != null && h.donorRate > base.rate) {
    if (cash >= DONOR_MIN) {
      return {
        mat: h.donorMaturity ?? 2,
        rate: h.donorRate,
        donor: true,
        donorEdge: h.donorRate - base.rate,
        blockedDonor: false,
      };
    }
    return { mat: base.mat, rate: base.rate, donor: false, donorEdge: null, blockedDonor: true };
  }
  return { mat: base.mat, rate: base.rate, donor: false, donorEdge: null, blockedDonor: false };
}

interface Holding {
  buyMonth: number;
  buyId: string;
  mat: number;
  rate: number;
  principal: number;
  maturesMonth: number;
  done: boolean;
}

/**
 * Money-weighted return (IRR) of a set of dated cash flows, as an annual %.
 * Deterministic bisection over `(1+r)`; returns 0 when there is no sign change.
 */
export function irr(flows: readonly { t: number; amount: number }[]): number {
  if (!flows.length) return 0;
  const npv = (r: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, f.t), 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo === 0) return lo * 100;
  if (fhi === 0) return hi * 100;
  if (flo * fhi > 0) return 0; // no bracketed root
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (fm === 0) return mid * 100;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return ((lo + hi) / 2) * 100;
}

/**
 * Compute the rolling ladder. A bounded month-by-month reducer over the horizon:
 * settle → contribute → invest, then value the live holdings at the horizon.
 */
export function plan(p: PlanParams): PlanResult {
  const startY = idToYear(p.startId);
  const N = Math.max(1, Math.round(p.horizonYears * 12));

  const holdings: Holding[] = [];
  const purchases: Purchase[] = [];
  const schedule: ReturnEvent[] = [];
  const flows: { t: number; amount: number }[] = [];

  let cash = 0;
  let withdrawn = 0;
  let donorUsedCount = 0;
  let donorEdgeSum = 0;
  let donorBlockedCount = 0;

  // Iterate through the horizon month (inclusive) so a tranche maturing exactly
  // at the horizon still books its final coupon + principal.
  for (let m = 0; m <= N; m++) {
    const y = startY + m / 12;

    // 1. Settle anniversaries and maturities of existing holdings.
    for (const h of holdings) {
      if (h.done) continue;
      const age = m - h.buyMonth;
      const rein = p.reinvest && m < N; // never "reinvest" at the horizon itself
      if (age > 0 && age % 12 === 0 && age <= h.mat * 12) {
        const coupon = (h.principal * h.rate) / 100;
        schedule.push({
          month: m, year: y, kind: "coupon", amount: coupon,
          fromId: h.buyId, fromLabel: byId[h.buyId].label, reinvested: rein,
        });
        if (rein) cash += coupon;
        else {
          withdrawn += coupon;
          flows.push({ t: m / 12, amount: coupon });
        }
      }
      if (age === h.mat * 12) {
        schedule.push({
          month: m, year: y, kind: "principal", amount: h.principal,
          fromId: h.buyId, fromLabel: byId[h.buyId].label, reinvested: rein,
        });
        if (rein) cash += h.principal;
        else {
          withdrawn += h.principal;
          flows.push({ t: m / 12, amount: h.principal });
        }
        h.done = true;
      }
    }

    if (m === N) break; // horizon reached — settle only, no new money

    // 2. Fresh monthly contribution.
    cash += p.monthly;
    flows.push({ t: m / 12, amount: -p.monthly });

    // 3. Invest the pooled cash into this month's edition.
    if (cash >= MIN_BUY) {
      const iss = issuanceForMonth(y);
      const c = choose(iss.id, p.risk, p.donorEligible, cash, p.currency);
      if (c.blockedDonor) donorBlockedCount++;
      const maturesMonth = m + c.mat * 12;
      holdings.push({
        buyMonth: m, buyId: iss.id, mat: c.mat, rate: c.rate,
        principal: cash, maturesMonth, done: false,
      });
      purchases.push({
        month: m, year: y, buyId: iss.id, buyLabel: iss.label,
        mat: c.mat, rate: c.rate, amount: cash, donor: c.donor, donorEdge: c.donorEdge,
        maturesMonth, maturesYear: startY + maturesMonth / 12,
      });
      if (c.donor) {
        donorUsedCount++;
        donorEdgeSum += c.donorEdge ?? 0;
      }
      cash = 0;
    }
  }

  // Value holdings still live at the horizon: principal + linearly accrued
  // coupon since their last anniversary (full-year coupons were already booked).
  let activeValue = 0;
  for (const h of holdings) {
    if (h.done) continue;
    const held = (N - h.buyMonth) / 12;
    const capped = Math.min(held, h.mat);
    const frac = capped - Math.floor(capped);
    activeValue += h.principal + ((h.principal * h.rate) / 100) * frac;
  }

  const terminal = cash + activeValue;
  flows.push({ t: N / 12, amount: terminal });

  const contributed = p.monthly * N;
  const finalValue = terminal + withdrawn;

  return {
    purchases,
    schedule,
    contributed,
    finalValue,
    profit: finalValue - contributed,
    years: N / 12,
    cagr: irr(flows),
    donorUsedCount,
    donorAvgEdge: donorUsedCount ? donorEdgeSum / donorUsedCount : 0,
    donorBlockedCount,
  };
}
