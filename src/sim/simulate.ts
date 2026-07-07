import { END } from "../data/history";
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
): Leg[] {
  const legs: Leg[] = [];
  let curId = startId;
  let cap = principal;
  let guard = 0;
  while (guard++ < 12) {
    const h = byId[curId];
    if (!h) break;
    const { rate, mat } = couponFor(curId, targetMat, donor);
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

/** Single-issuance strategy: the whole amount in one leg chain. */
export function runSingle(p: SimParams): SimResult {
  const legs = simulateLeg(p.startId, p.amount, p.mat, p.donor, p.reinvest);
  return { blocks: [{ legs, amount: p.amount }] };
}

/**
 * Ladder strategy: split into 3 equal tranches across the shortest / mid /
 * longest maturities available at the start issuance.
 */
export function runLadder(p: SimParams): SimResult {
  const mats = matsAt(p.startId);
  const chosen = p.donor
    ? [2, 2, 2]
    : [mats[0], mats[Math.floor(mats.length / 2)], mats[mats.length - 1]];
  const per = p.amount / 3;
  const blocks = chosen.map((m) => ({
    legs: simulateLeg(p.startId, per, m, p.donor, p.reinvest),
    amount: per,
  }));
  return { blocks };
}

/** Run the chosen strategy. */
export function run(p: SimParams): SimResult {
  return p.strat === "single" ? runSingle(p) : runLadder(p);
}

/** Total horizon value of a run across all blocks. */
export function finalValueOf(res: SimResult): number {
  let finalValue = 0;
  res.blocks.forEach((b) => (finalValue += valueOf(b.legs)));
  return finalValue;
}

/** Compute headline figures (final value, profit, horizon years, CAGR). */
export function summarize(p: SimParams): Summary {
  const res = run(p);
  const invested = p.amount;
  const finalValue = finalValueOf(res);
  const profit = finalValue - invested;
  const years = END - idToYear(p.startId);
  const cagr = years > 0 ? (Math.pow(finalValue / invested, 1 / years) - 1) * 100 : 0;
  return { finalValue, profit, years, cagr };
}
