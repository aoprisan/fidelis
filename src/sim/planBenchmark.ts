import {
  forwardDepositBenchmark,
  type ForwardBenchmark,
} from "./forwardBenchmark";
import { idToYear } from "./history";
import { type PlanParams, type PlanResult } from "./planner";

/**
 * Deposit/inflation benchmark for the rolling ladder PLANNER — a thin adapter
 * that projects the plan's monthly contribution stream onto the shared
 * `forwardDepositBenchmark` engine. Pure and DOM-free; RON-only (the caller
 * gates EUR out, since the BNR/INS series is denominated in lei).
 */
export function planBenchmark(p: PlanParams, r: PlanResult): ForwardBenchmark {
  const startYear = idToYear(p.startId);
  const N = Math.max(1, Math.round(p.horizonYears * 12));
  const contributions: { year: number; amount: number }[] = [];
  for (let m = 0; m < N; m++) contributions.push({ year: startYear + m / 12, amount: p.monthly });

  return forwardDepositBenchmark({
    contributions,
    startYear,
    horizonYear: startYear + N / 12,
    contributed: p.monthly * N,
    fidelisFinal: r.finalValue,
    fidelisProfit: r.profit,
    fidelisIrr: r.cagr,
  });
}
