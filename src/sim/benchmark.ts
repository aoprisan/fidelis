import { BENCHMARKS, DEPOSIT_TAX, type BenchmarkPoint } from "../data/benchmarks";
import { END } from "../data/history";
import { idToYear } from "./history";
import { contributionMonths, type SimParams, type ValuePoint } from "./simulate";

/** Benchmark observation at or before decimal year `t` (last-known fallback). */
export function benchmarkAt(t: number): BenchmarkPoint {
  let best = BENCHMARKS[0];
  for (const b of BENCHMARKS) {
    if (idToYear(b.id) <= t + 0.001) best = b;
    else break;
  }
  return best;
}

/**
 * The most recent year-over-year CPI change (%) in the macro series — the
 * "current inflation" figure. Used by the forward planner benchmark as a
 * constant go-forward assumption, since the CPI table stops at the program
 * horizon. Returns 0 if the series is shorter than 13 months.
 */
export function latestInflation(): number {
  const n = BENCHMARKS.length;
  if (n < 13) return 0;
  return (BENCHMARKS[n - 1].cpiIndex / BENCHMARKS[n - 13].cpiIndex - 1) * 100;
}

/**
 * One taxed RON term deposit opened at `t0`: annual capitalization with 10%
 * tax withheld on each year's interest, the rate re-fixing at the then-current
 * benchmark rate on every anniversary, net interest accruing linearly within a
 * period, and the final period pro-rated at the horizon. Mirrors the Fidelis
 * convention that a not-yet-made contribution counts at face value.
 */
function depositValueAt(t0: number, amount: number, t: number): number {
  if (t <= t0) return amount;
  let balance = amount;
  let from = t0;
  while (from < Math.min(t, END) - 1e-9) {
    const to = Math.min(from + 1, t, END);
    const rate = benchmarkAt(from).depositRate;
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
  const starts = contributionMonths(p).map(idToYear);
  if (starts.length === 0) return [];
  const breaks = new Set<number>();
  for (const t0 of starts) depositBreaks(t0).forEach((t) => breaks.add(t));
  const first = Math.min(...starts);
  const ts = [...breaks].filter((t) => t >= first && t <= END).sort((a, b) => a - b);
  return ts.map((t) => ({
    t,
    value: starts.reduce((sum, t0) => sum + depositValueAt(t0, p.amount, t), 0),
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
 * `real(t) = value(t) · cpi(t0) / cpi(t)`.
 */
export function deflate(points: ValuePoint[]): ValuePoint[] {
  if (points.length === 0) return [];
  const base = benchmarkAt(points[0].t).cpiIndex;
  return points.map((pt) => ({
    t: pt.t,
    value: (pt.value * base) / benchmarkAt(pt.t).cpiIndex,
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
  const real = deflate(fidelisPoints);
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
