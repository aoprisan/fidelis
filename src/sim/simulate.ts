import { END, type Currency } from "../data/history";
import { byId, couponFor, idToYear, issuanceAtOrAfter, matsAt } from "./history";

/** Investment strategy. */
export type Strategy = "single" | "ladder";

/** Simulation parameters (the pure inputs to a run). */
export interface SimParams {
  amount: number;
  startId: string;
  strat: Strategy;
  mat: number;
  donor: boolean;
  reinvest: boolean;
  /** Tranche currency. Donor tranches exist only for RON. */
  currency: Currency;
  /**
   * Recurring contribution plan: the issuance months in which `amount` is
   * invested (the same amount each month), sorted ascending. When present and
   * non-empty the run becomes a series of contributions instead of a single
   * lump sum; `startId` is kept equal to the first plan month. Absent/empty for
   * a one-off lump-sum scenario.
   */
  plan?: string[];
}

/** One holding period: principal held to maturity paying an annual coupon. */
export interface Leg {
  startId: string;
  startLabel: string;
  mat: number;
  rate: number;
  principal: number;
  startY: number;
  endY: number;
  /** Whole coupons actually paid before the horizon. */
  couponsPaid: number;
  couponAnnual: number;
  /** Whether the leg fully matured within the horizon. */
  matured: boolean;
}

/** A capital block (one leg chain), plus the amount originally allocated. */
export interface Block {
  legs: Leg[];
  amount: number;
}

/** The result of a run: one or more capital blocks. */
export interface SimResult {
  blocks: Block[];
}

/** Headline figures derived from a run. */
export interface Summary {
  finalValue: number;
  profit: number;
  years: number;
  cagr: number;
}

/** One sample on the value-over-time curve. */
export interface ValuePoint {
  /** Decimal year. */
  t: number;
  /** Portfolio value at that instant. */
  value: number;
}

/**
 * Core simulation: a deterministic reducer over successive issuances.
 *
 * A leg holds `principal` to maturity, paying an annual (tax-free) coupon. At
 * maturity, if reinvesting, principal plus all coupons compound into the next
 * equivalent issuance. Returns the ordered chain of legs.
 */
export function simulateLeg(
  startId: string,
  principal: number,
  targetMat: number,
  donor: boolean,
  reinvest: boolean,
  currency: Currency = "RON",
): Leg[] {
  const legs: Leg[] = [];
  let curId = startId;
  let cap = principal;
  let guard = 0;
  while (guard++ < 12) {
    const h = byId[curId];
    if (!h) break;
    const { rate, mat } = couponFor(curId, targetMat, donor, currency);
    const startY = idToYear(curId);
    const endY = startY + mat;
    // coupons actually paid before the horizon
    const couponsPaid = Math.max(0, Math.min(mat, Math.floor(END - startY)));
    const couponAnnual = (cap * rate) / 100;
    legs.push({
      startId: curId,
      startLabel: h.label,
      mat,
      rate,
      principal: cap,
      startY,
      endY,
      couponsPaid,
      couponAnnual,
      matured: endY <= END,
    });
    if (!reinvest || endY > END) break;
    // roll over: capital + all coupons compounded
    cap = cap + couponAnnual * mat;
    curId = issuanceAtOrAfter(endY).id;
    if (idToYear(curId) < endY - 0.001) break;
    targetMat = donor ? 2 : targetMat;
  }
  return legs;
}

/**
 * Value today (at the horizon) of a chain of legs.
 *
 * Rollover compounds prior coupons into each leg's principal, so the realized
 * value is that of the final leg: a matured leg contributes principal plus all
 * its coupons; a still-running leg contributes principal plus linearly accrued
 * coupon on the elapsed time.
 */
export function valueOf(legs: Leg[]): number {
  let v = 0;
  for (const leg of legs) {
    if (leg.matured) {
      v = leg.principal + leg.couponAnnual * leg.mat;
    } else {
      const elapsed = END - leg.startY;
      const accrued = leg.couponAnnual * elapsed;
      v = leg.principal + accrued;
    }
  }
  return v;
}

/**
 * Value of a leg chain at an arbitrary instant `t` (decimal year).
 *
 * Same model as {@link valueOf}, generalized to any point in time: before the
 * chain starts it is worth its principal; within the active leg it is principal
 * plus linearly accrued coupon; on rollover the next leg's principal already
 * carries the compounded coupons, so the curve is continuous. Evaluated at the
 * horizon it agrees with {@link valueOf}.
 */
export function valueAt(legs: Leg[], t: number): number {
  if (legs.length === 0) return 0;
  if (t <= legs[0].startY) return legs[0].principal;
  let active = legs[0];
  for (const leg of legs) {
    if (leg.startY <= t) active = leg;
    else break;
  }
  const cap = Math.min(t, Math.min(active.endY, END));
  const elapsed = Math.max(0, cap - active.startY);
  return active.principal + active.couponAnnual * elapsed;
}

/**
 * Portfolio value over time across all blocks, as a polyline from the start
 * year to the horizon. The aggregate value is piecewise-linear in `t`, so
 * sampling at every leg boundary reproduces the exact curve. The first point is
 * the invested amount; the last equals {@link finalValueOf}.
 */
export function trajectory(res: SimResult): ValuePoint[] {
  const legs = res.blocks.flatMap((b) => b.legs);
  if (legs.length === 0) return [];
  const start = Math.min(...legs.map((l) => l.startY));
  const breaks = new Set<number>([start, END]);
  for (const leg of legs) {
    breaks.add(leg.startY);
    breaks.add(Math.min(leg.endY, END));
  }
  const ts = [...breaks].filter((t) => t >= start && t <= END).sort((a, b) => a - b);
  return ts.map((t) => ({
    t,
    value: res.blocks.reduce((sum, b) => sum + valueAt(b.legs, t), 0),
  }));
}

/** Single-issuance strategy: the whole amount in one leg chain. */
export function runSingle(p: SimParams): SimResult {
  const legs = simulateLeg(p.startId, p.amount, p.mat, p.donor, p.reinvest, p.currency);
  return { blocks: [{ legs, amount: p.amount }] };
}

/**
 * Ladder strategy: split into 3 equal tranches across the shortest / mid /
 * longest maturities available at the start issuance.
 */
export function runLadder(p: SimParams): SimResult {
  const mats = matsAt(p.startId, p.currency);
  const chosen =
    p.donor && p.currency === "RON"
      ? [2, 2, 2]
      : [mats[0], mats[Math.floor(mats.length / 2)], mats[mats.length - 1]];
  const per = p.amount / 3;
  const blocks = chosen.map((m) => ({
    legs: simulateLeg(p.startId, per, m, p.donor, p.reinvest, p.currency),
    amount: per,
  }));
  return { blocks };
}

/**
 * The contribution schedule: the months in which the amount is invested. For a
 * recurring plan these are its months; otherwise the single start issuance.
 */
export function contributionMonths(p: SimParams): string[] {
  return p.plan && p.plan.length > 0 ? p.plan : [p.startId];
}

/**
 * Run the chosen strategy. For a lump sum this is one contribution at the start
 * issuance; for a recurring plan the same `amount` is invested at every plan
 * month, and the resulting capital blocks are concatenated (so summing across
 * blocks aggregates the whole plan).
 */
export function run(p: SimParams): SimResult {
  const strat = p.strat === "single" ? runSingle : runLadder;
  const blocks = contributionMonths(p).flatMap(
    (id) => strat(id === p.startId ? p : { ...p, startId: id }).blocks,
  );
  return { blocks };
}

/** One dated cash flow: a signed amount `cf` at decimal year `t`. */
export interface CashFlow {
  t: number;
  cf: number;
}

/**
 * Money-weighted annualized return (%) of a dated cash-flow stream, found by
 * bisection on the net present value. Used for recurring plans, where several
 * contributions are made on different dates: a single (final/invested) CAGR
 * would misstate the return because the money was not all invested for the full
 * horizon. Returns 0 when the flows don't bracket a root (e.g. no net gain).
 */
export function irr(flows: CashFlow[]): number {
  if (flows.length === 0) return 0;
  const t0 = Math.min(...flows.map((f) => f.t));
  const npv = (r: number): number =>
    flows.reduce((s, f) => s + f.cf / Math.pow(1 + r, f.t - t0), 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo === 0) return lo * 100;
  if (fhi === 0) return hi * 100;
  if (flo * fhi > 0) return 0; // no sign change → IRR undefined for these flows
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid * 100;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return ((lo + hi) / 2) * 100;
}

/** Total horizon value of a run across all blocks. */
export function finalValueOf(res: SimResult): number {
  let finalValue = 0;
  res.blocks.forEach((b) => (finalValue += valueOf(b.legs)));
  return finalValue;
}

/**
 * Compute headline figures from an already-computed run (avoids re-running when
 * the caller already has the {@link SimResult}). Invested is the amount times
 * the number of contributions; the horizon runs from the first contribution.
 * For a single contribution the annualized return is the plain CAGR; for a
 * recurring plan it is the money-weighted return ({@link irr}) of the
 * contribution cash flows against the final value.
 */
export function summarizeOf(p: SimParams, res: SimResult): Summary {
  const months = contributionMonths(p);
  const invested = p.amount * months.length;
  const finalValue = finalValueOf(res);
  const profit = finalValue - invested;
  const startYear = Math.min(...months.map(idToYear));
  const years = END - startYear;
  let cagr: number;
  if (invested <= 0) {
    cagr = 0;
  } else if (months.length <= 1) {
    cagr = years > 0 ? (Math.pow(finalValue / invested, 1 / years) - 1) * 100 : 0;
  } else {
    const flows: CashFlow[] = months.map((id) => ({ t: idToYear(id), cf: -p.amount }));
    flows.push({ t: END, cf: finalValue });
    cagr = irr(flows);
  }
  return { finalValue, profit, years, cagr };
}

/** Compute headline figures (final value, profit, horizon years, CAGR). */
export function summarize(p: SimParams): Summary {
  return summarizeOf(p, run(p));
}
