import { describe, expect, it } from "vitest";
import { DEPOSIT_TAX } from "../data/benchmarks";
import { latestInflation } from "./benchmark";
import { computeOffer, currentOffer, type OfferParams } from "./offer";
import { offerBenchmark } from "./offerBenchmark";

const lump: OfferParams = {
  currency: "RON",
  amount: 50000,
  mode: "single",
  startId: currentOffer().id,
  contrib: "once",
  horizon: "maturity",
  pick: "long",
};

describe("offerBenchmark", () => {
  it("holds the identities the Plan-tab stats are built on", () => {
    const res = computeOffer(lump);
    const b = offerBenchmark(res);

    expect(b.advantage).toBeCloseTo(res.finalValue - b.depositFinal, 6);
    expect(b.taxSaved).toBeCloseTo(DEPOSIT_TAX * res.totalInterest, 6);
    expect(b.breakEvenGross).toBeCloseTo(res.yieldPct / (1 - DEPOSIT_TAX), 6);
    const depositGain = b.depositFinal - res.invested;
    expect(b.depositTax).toBeCloseTo((depositGain * DEPOSIT_TAX) / (1 - DEPOSIT_TAX), 6);
  });

  it("beats a taxed deposit held to the same maturity", () => {
    const res = computeOffer(lump);
    const b = offerBenchmark(res);
    // A tax-free long Fidelis tranche clears the taxed deposit at current rates.
    expect(b.depositFinal).toBeGreaterThan(res.invested);
    expect(b.advantage).toBeGreaterThan(0);
    expect(b.breakEvenGross).toBeGreaterThan(res.yieldPct);
  });

  it("uses the plan's own valuation horizon (marks a past edition to today)", () => {
    const res = computeOffer({
      ...lump,
      startId: "2024-10",
      contrib: "monthly",
      horizon: "now",
      amount: 5000,
    });
    const b = offerBenchmark(res);
    // Deposit follows the same staggered contributions to the same horizon.
    expect(b.depositFinal).toBeGreaterThan(res.invested);
    expect(b.assumedInflation).toBeCloseTo(latestInflation(), 6);
    expect(b.realCagr).toBeCloseTo(
      ((1 + res.yieldPct / 100) / (1 + b.assumedInflation / 100) - 1) * 100,
      6,
    );
  });
});
