import { describe, expect, it } from "vitest";
import { DEPOSIT_TAX } from "../data/benchmarks";
import { latestInflation } from "./benchmark";
import { planBenchmark } from "./planBenchmark";
import { plan, type PlanParams } from "./planner";

const base: PlanParams = {
  monthly: 1000,
  horizonYears: 3,
  startId: "2025-02",
  risk: "balanced",
  donorEligible: false,
  reinvest: true,
  currency: "RON",
};

describe("planBenchmark", () => {
  it("holds the identities the headline stats are built on", () => {
    const r = plan(base);
    const b = planBenchmark(base, r);

    expect(b.advantage).toBeCloseTo(r.finalValue - b.depositFinal, 6);
    expect(b.taxSaved).toBeCloseTo(DEPOSIT_TAX * r.profit, 6);
    expect(b.breakEvenGross).toBeCloseTo(r.cagr / (1 - DEPOSIT_TAX), 6);
    const depositGain = b.depositFinal - base.monthly * 36;
    expect(b.depositTax).toBeCloseTo((depositGain * DEPOSIT_TAX) / (1 - DEPOSIT_TAX), 6);
  });

  it("reports the real return as the Fisher deflation of the IRR", () => {
    const r = plan(base);
    const b = planBenchmark(base, r);
    const g = latestInflation();
    expect(b.assumedInflation).toBeCloseTo(g, 6);
    expect(b.realCagr).toBeCloseTo(((1 + r.cagr / 100) / (1 + g / 100) - 1) * 100, 6);
    expect(b.realCagr).toBeGreaterThan(0);
    expect(b.realCagr).toBeLessThan(r.cagr);
  });

  it("beats a taxed deposit on the same contribution stream", () => {
    const r = plan(base);
    const b = planBenchmark(base, r);
    expect(b.depositFinal).toBeGreaterThan(base.monthly * 36);
    expect(b.advantage).toBeGreaterThan(0);
    expect(b.breakEvenGross).toBeGreaterThan(r.cagr);
  });
});
