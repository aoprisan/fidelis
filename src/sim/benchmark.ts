import { BENCHMARKS, DEPOSIT_TAX, type BenchmarkPoint } from "../data/benchmarks";
import { END } from "../data/history";
import { idToYear } from "./history";
import { contributionMonths, currencyOf, type Currency, type SimParams, type ValuePoint } from "./simulate";

/** Benchmark observation at or before decimal year `t` (last-known fallback). */
export function benchmarkAt(t: number): BenchmarkPoint {
  let best = BENCHMARKS[0];
  for (const b of BENCHMARKS) {
    if (idToYear(b.id) <= t + 0.001) best = b;
    else break;
  }
  return best;
}

/** Deposit rate (%) at `t` for the given currency. */
function depositRateAt(t: number, cur: Currency): number {
  const b = benchmarkAt(t);
  return cur === "EUR" ? b.eurDepositRate : b.depositRate;
}

/** Consumer price index at `t` for the given currency (RON: INS, EUR: HICP). */
function cpiAt(t: number, cur: Currency): number {
  const b = benchmarkAt(t);
  return cur === "EUR" ? b.eurCpiIndex : b.cpiIndex;
}

/**
 * One taxed term deposit opened at `t0`, in the scenario's currency: annual
 * capitalization with 10% tax withheld on each year's interest, the rate
 * re-fixing at the then-current benchmark rate on every anniversary, net
 * interest accruing linearly within a period, and the final period pro-rated at
 * the horizon. Mirrors the Fidelis convention that a not-yet-made contribution
 * counts at face value.
 */
function depositValueAt(t0: number, amount: number, t: number, cur: Currency): number {
  if (t <= t0) return amount;
  let balance = amount;
  let from = t0;
  while (from < Math.min(t, END) - 1e-9) {
    const to = Math.min(from + 1, t, END);
    const rate = depositRateAt(from, cur);
    const net = ((balance * rate) / 100) * (1 - DEPOSIT_TAX);
    balance += net * (to - from);
    from = to;
  }
  return balance;
}

/** Anniversary breakpoints of one deposit: start, whole years, horizon. */
function depositBreaks(t0: number): number[] {
  const ts = [t0];
  for (let t = t0 + 1; t < END; t += 1) ts.push(t);
  ts.push(END);
  return ts;
}

/**
 * Value curve of the taxed-deposit alternative following the SAME contribution
 * schedule as the Fidelis plan. Sampled at every contribution start, every
 * deposit anniversary and the horizon, so the piecewise-linear curve is exact
 * (the same guarantee `trajectory()` gives for the Fidelis run).
 */
export function depositTrajectory(p: SimParams): ValuePoint[] {
  const cur = currencyOf(p);
  const starts = contributionMonths(p).map(idToYear);
  if (starts.length === 0) return [];
  const breaks = new Set<number>();
  for (const t0 of starts) depositBreaks(t0).forEach((t) => breaks.add(t));
  const first = Math.min(...starts);
  const ts = [...breaks].filter((t) => t >= first && t <= END).sort((a, b) => a - b);
  return ts.map((t) => ({
    t,
    value: starts.reduce((sum, t0) => sum + depositValueAt(t0, p.amount, t, cur), 0),
  }));
}

/** Total 10% tax withheld in the deposit alternative up to the horizon. */
export function depositTaxOf(p: SimParams): number {
  // Net interest is (1 - tax) of gross, so the tax paid is a fixed proportion
  // of the net gain — no need to replay the accrual loop.
  const points = depositTrajectory(p);
  if (points.length === 0) return 0;
  const invested = p.amount * contributionMonths(p).length;
  const netGain = points[points.length - 1].value - invested;
  return (netGain * DEPOSIT_TAX) / (1 - DEPOSIT_TAX);
}

/**
 * Deflate a nominal value curve into the prices of its first point's date:
 * `real(t) = value(t) · cpi(t0) / cpi(t)`. Uses the RON (INS) price index by
 * default, or the euro-area (HICP) index for a EUR scenario.
 */
export function deflate(points: ValuePoint[], cur: Currency = "RON"): ValuePoint[] {
  if (points.length === 0) return [];
  const base = cpiAt(points[0].t, cur);
  return points.map((pt) => ({
    t: pt.t,
    value: (pt.value * base) / cpiAt(pt.t, cur),
  }));
}

/** Headline figures of the Fidelis-vs-alternatives comparison. */
export interface BenchmarkSummary {
  /** Net value of the taxed-deposit alternative at the horizon. */
  depositFinal: number;
  /** Tax paid in the deposit alternative. */
  depositTax: number;
  /** Fidelis final value minus the deposit alternative's. */
  advantage: number;
  /**
   * The tax an equivalently-taxed instrument would have cost on the Fidelis
   * profit. Exact under the model: principal redeems at par, so the whole
   * profit is coupon interest.
   */
  taxSaved: number;
  /** Fidelis final value deflated into start-date prices. */
  realFinal: number;
  /** Real (inflation-adjusted) profit: `realFinal - invested`. */
  realProfit: number;
}

/**
 * Compare an already-computed Fidelis value curve (`trajectory(run(p))`)
 * against the taxed-deposit alternative and inflation.
 */
export function benchmarkSummary(p: SimParams, fidelisPoints: ValuePoint[]): BenchmarkSummary {
  const invested = p.amount * contributionMonths(p).length;
  const fidelisFinal =
    fidelisPoints.length > 0 ? fidelisPoints[fidelisPoints.length - 1].value : invested;
  const depositPoints = depositTrajectory(p);
  const depositFinal =
    depositPoints.length > 0 ? depositPoints[depositPoints.length - 1].value : invested;
  const real = deflate(fidelisPoints, currencyOf(p));
  const realFinal = real.length > 0 ? real[real.length - 1].value : invested;
  return {
    depositFinal,
    depositTax: depositTaxOf(p),
    advantage: fidelisFinal - depositFinal,
    taxSaved: DEPOSIT_TAX * (fidelisFinal - invested),
    realFinal,
    realProfit: realFinal - invested,
  };
}
