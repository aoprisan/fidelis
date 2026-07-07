import type { Currency } from "../data/history";
import {
  byId,
  couponFor,
  idToYear,
  issuanceAtOrAfter,
  matsAt,
  maxMatAt,
} from "./history";

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
  currency: Currency;
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
  /** Whole coupons paid over the term (equals `mat`, since legs are held to maturity). */
  couponsPaid: number;
  couponAnnual: number;
  /** Whether the leg fully matured (always true — legs are held to maturity). */
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
 * Core simulation: a deterministic reducer over successive issuances, held to
 * maturity.
 *
 * A leg holds `principal` to maturity, paying an annual (tax-free) coupon; every
 * leg runs to its full term, so all its coupons are paid. When `reinvest` is on,
 * at each maturity the principal plus all coupons compound into the edition
 * current at that moment, and the chain keeps rolling until it reaches the
 * horizon target — the longest maturity available at the start issuance (so a
 * short bought bond is shown rolled out over a comparable span). Past the last
 * real issuance the terms of the final known edition are reused (frozen rates),
 * mirroring the forward planner. Returns the ordered chain of legs.
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
  let startY = idToYear(startId);
  let editionId = startId;
  let cap = principal;
  // Reinvestment horizon: hold roughly one longest-bond span from the start.
  const target = idToYear(startId) + maxMatAt(startId, currency);
  let guard = 0;
  while (guard++ < 12) {
    const ed = byId[editionId];
    if (!ed) break;
    const { rate, mat } = couponFor(editionId, targetMat, donor, currency);
    const endY = startY + mat;
    const couponAnnual = (cap * rate) / 100;
    legs.push({
      startId: editionId,
      startLabel: ed.label,
      mat,
      rate,
      principal: cap,
      startY,
      endY,
      // Held to maturity: every scheduled coupon is paid.
      couponsPaid: mat,
      couponAnnual,
      matured: true,
    });
    if (!reinvest || endY >= target - 1e-9) break;
    // roll over: capital + all coupons compounded, reinvested at maturity
    cap = cap + couponAnnual * mat;
    startY = endY;
    editionId = issuanceAtOrAfter(endY).id;
  }
  return legs;
}

/**
 * Value of a chain of legs at its final maturity.
 *
 * Rollover compounds prior coupons into each leg's principal, so the realized
 * value is that of the final (matured) leg: its principal plus all its coupons.
 */
export function valueOf(legs: Leg[]): number {
  const last = legs[legs.length - 1];
  return last ? last.principal + last.couponAnnual * last.mat : 0;
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

/**
 * The run's horizon (decimal year): the latest maturity across all blocks. With
 * a ladder, shorter rungs mature earlier and — if not reinvested — sit as cash
 * until the longest rung matures; the CAGR is measured against this horizon.
 */
export function horizonOf(res: SimResult): number {
  let end = -Infinity;
  for (const b of res.blocks)
    for (const leg of b.legs) end = Math.max(end, leg.endY);
  return end === -Infinity ? 0 : end;
}

/** Compute headline figures (final value, profit, horizon years, CAGR). */
export function summarize(p: SimParams): Summary {
  const res = run(p);
  const invested = p.amount;
  const finalValue = finalValueOf(res);
  const profit = finalValue - invested;
  const years = horizonOf(res) - idToYear(p.startId);
  const cagr =
    years > 0 && invested > 0
      ? (Math.pow(finalValue / invested, 1 / years) - 1) * 100
      : 0;
  return { finalValue, profit, years, cagr };
}
