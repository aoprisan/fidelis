import {
  forwardDepositBenchmark,
  type ForwardBenchmark,
} from "./forwardBenchmark";
import type { OfferResult } from "./offer";

/**
 * Deposit/inflation benchmark for the Plan tab's offer model — a thin adapter
 * that projects the plan's per-edition contributions onto the shared
 * `forwardDepositBenchmark` engine. Pure and DOM-free; RON-only (the caller
 * gates EUR out, since the BNR/INS series is denominated in lei).
 *
 * Contributions are reconstructed from the allocations (summing each edition's
 * rungs back to one dated contribution), so the deposit alternative follows the
 * exact same schedule and horizon the Fidelis plan was valued on — whether that
 * is hold-to-maturity or marked to today.
 */
export function offerBenchmark(res: OfferResult): ForwardBenchmark {
  const byContrib = new Map<string, { year: number; amount: number }>();
  for (const a of res.allocs) {
    const g = byContrib.get(a.contribId) ?? { year: a.buyYear, amount: 0 };
    g.amount += a.principal;
    byContrib.set(a.contribId, g);
  }

  return forwardDepositBenchmark({
    contributions: [...byContrib.values()],
    startYear: res.startYear,
    horizonYear: res.horizonYear,
    contributed: res.invested,
    fidelisFinal: res.finalValue,
    fidelisProfit: res.totalInterest,
    fidelisIrr: res.yieldPct,
  });
}
