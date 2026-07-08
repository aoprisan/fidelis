import { DEPOSIT_TAX } from "../data/benchmarks";
import { benchmarkAt, latestInflation } from "./benchmark";
import { irr } from "./planner";

/**
 * Forward-looking "is this better than a bank deposit?" benchmark, shared by the
 * Plan tab (`offer.ts`) and the rolling Planner (`planner.ts`). It answers the
 * saver's first question — *how does this compare to just leaving the money in a
 * taxed term deposit?* — plus the tax the Fidelis exemption avoids, the gross
 * rate a deposit would need to break even, and the real return after inflation.
 *
 * Pure and DOM-free like the rest of `sim/`. Two honest simplifications, both
 * shared with the models it benchmarks: the macro series (BNR deposit rates, INS
 * CPI) stops at the program horizon, so beyond it the last-known deposit rate is
 * held flat and inflation is assumed constant at the latest observed
 * year-over-year value — the same "rates as last seen hold forward" premise the
 * Fidelis side runs on, keeping both sides of the comparison consistent.
 */

/**
 * Value at `t` of one taxed RON term deposit opened at `t0`: annual
 * capitalization, the rate re-fixing at each anniversary to the then-current
 * benchmark (reused forward past the series), 10% tax withheld on each period's
 * interest, net interest accruing linearly within a period. Unlike the historic
 * `benchmark.ts` version this is NOT capped at the program horizon — a forward
 * plan can run years past the macro data.
 */
function depositValueAt(t0: number, amount: number, t: number): number {
  if (t <= t0) return amount;
  let balance = amount;
  let from = t0;
  while (from < t - 1e-9) {
    const to = Math.min(from + 1, t);
    const rate = benchmarkAt(from).depositRate;
    const net = ((balance * rate) / 100) * (1 - DEPOSIT_TAX);
    balance += net * (to - from);
    from = to;
  }
  return balance;
}

/** Headline figures of a plan-vs-alternatives comparison. */
export interface ForwardBenchmark {
  /** Net-of-tax value of the deposit alternative on the same contribution schedule. */
  depositFinal: number;
  /** Total 10% interest tax withheld over the horizon in the deposit alternative. */
  depositTax: number;
  /** Money-weighted annualized return (IRR) of the deposit alternative, %. */
  depositCagr: number;
  /** Fidelis final value minus the deposit alternative's (can be negative). */
  advantage: number;
  /**
   * Tax an equivalently-taxed instrument would owe on the Fidelis profit —
   * avoided outright by the Fidelis exemption. Principal redeems at par, so the
   * whole profit is (tax-free) coupon interest.
   */
  taxSaved: number;
  /** Gross annual rate a taxed deposit would need to match the Fidelis IRR, %. */
  breakEvenGross: number;
  /** Assumed constant forward inflation (latest observed YoY), %. */
  assumedInflation: number;
  /**
   * Real (inflation-adjusted) annualized return, %: the Fisher deflation of the
   * money-weighted IRR, `(1 + irr)/(1 + inflation) − 1`. Unlike deflating the
   * terminal value by the full-horizon inflation factor, this is artifact-free
   * for a staggered contribution stream (it doesn't over-penalize money only
   * recently contributed).
   */
  realCagr: number;
}

/** The Fidelis side of the comparison, plus its dated contribution schedule. */
export interface ForwardBenchmarkInput {
  /** Every contribution: absolute decimal year and amount (offer currency). */
  contributions: readonly { year: number; amount: number }[];
  /** First contribution year — IRR cash-flow times are measured from here. */
  startYear: number;
  /** Valuation year both sides are carried to. */
  horizonYear: number;
  /** Total contributed capital. */
  contributed: number;
  /** Fidelis final value at the horizon. */
  fidelisFinal: number;
  /** Fidelis net profit (drives the avoided-tax figure). */
  fidelisProfit: number;
  /** Fidelis money-weighted IRR, %. */
  fidelisIrr: number;
}

/**
 * Compare a Fidelis plan against a taxed bank deposit fed by the SAME dated
 * contributions, and against inflation. Denominated in RON (BNR/INS series) —
 * callers gate this to RON plans.
 */
export function forwardDepositBenchmark(input: ForwardBenchmarkInput): ForwardBenchmark {
  const flows: { t: number; amount: number }[] = [];
  let depositFinal = 0;
  for (const c of input.contributions) {
    depositFinal += depositValueAt(c.year, c.amount, input.horizonYear);
    flows.push({ t: c.year - input.startYear, amount: -c.amount });
  }
  flows.push({ t: input.horizonYear - input.startYear, amount: depositFinal });

  const depositGain = depositFinal - input.contributed;
  // Net interest is (1 - tax) of gross, so tax withheld is a fixed proportion of
  // the net gain — no need to replay the accrual loop.
  const depositTax = (depositGain * DEPOSIT_TAX) / (1 - DEPOSIT_TAX);
  const g = latestInflation();

  return {
    depositFinal,
    depositTax,
    depositCagr: input.contributed > 0 ? irr(flows) : 0,
    advantage: input.fidelisFinal - depositFinal,
    taxSaved: DEPOSIT_TAX * input.fidelisProfit,
    breakEvenGross: input.fidelisIrr / (1 - DEPOSIT_TAX),
    assumedInflation: g,
    realCagr: ((1 + input.fidelisIrr / 100) / (1 + g / 100) - 1) * 100,
  };
}
