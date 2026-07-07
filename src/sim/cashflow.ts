import { runHorizon, type SimParams, type SimResult } from "./simulate";

/** What a cash event pays out: an annual coupon or the principal at maturity. */
export type CashEventKind = "coupon" | "principal";

/** One dated payment implied by a run. */
export interface CashEvent {
  /** Payment instant, decimal year. */
  t: number;
  kind: CashEventKind;
  amount: number;
  /** Issuance the paying leg belongs to. */
  legStartId: string;
  legLabel: string;
  /**
   * True when this cash was rolled into the next leg (a reinvest chain folds
   * coupons + principal into the successor's principal) rather than paid out.
   */
  reinvested: boolean;
}

/**
 * All cash events implied by a run, sorted ascending by date, capped at the
 * horizon. Coupon k of a leg pays `couponAnnual` at `startY + k` for each
 * whole coupon actually paid (`couponsPaid`); principal returns at `endY` for
 * matured legs. Events of every leg except the last of its block are marked
 * `reinvested` when the plan reinvests — the chain continued, so that cash
 * was compounded, not collected.
 */
export function couponSchedule(res: SimResult, p: SimParams): CashEvent[] {
  const events: CashEvent[] = [];
  for (const block of res.blocks) {
    block.legs.forEach((leg, i) => {
      const chainContinued = p.reinvest && i < block.legs.length - 1;
      for (let k = 1; k <= leg.couponsPaid; k++) {
        events.push({
          t: leg.startY + k,
          kind: "coupon",
          amount: leg.couponAnnual,
          legStartId: leg.startId,
          legLabel: leg.startLabel,
          reinvested: chainContinued,
        });
      }
      if (leg.matured) {
        events.push({
          t: leg.endY,
          kind: "principal",
          amount: leg.principal,
          legStartId: leg.startId,
          legLabel: leg.startLabel,
          reinvested: chainContinued,
        });
      }
    });
  }
  // Cap at the run's horizon — `END` for a mark-to-now run, or the latest
  // maturity when holding to maturity (so the full coupon schedule shows).
  const bound = runHorizon(p, res);
  return events.filter((e) => e.t <= bound + 1e-9).sort((a, b) => a.t - b.t);
}

/** Events grouped by calendar year, with the per-year total paid. */
export interface YearBucket {
  year: number;
  events: CashEvent[];
  total: number;
}

/** Bucket a sorted event stream by calendar year. */
export function scheduleByYear(events: CashEvent[]): YearBucket[] {
  const buckets = new Map<number, YearBucket>();
  for (const e of events) {
    const year = Math.floor(e.t + 1e-9);
    let b = buckets.get(year);
    if (!b) {
      b = { year, events: [], total: 0 };
      buckets.set(year, b);
    }
    b.events.push(e);
    b.total += e.amount;
  }
  return [...buckets.values()].sort((a, b) => a.year - b.year);
}
