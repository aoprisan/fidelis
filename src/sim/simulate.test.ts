import { describe, expect, it } from "vitest";
import { END } from "../data/history";
import { couponFor, idToYear, issuanceAtOrAfter, matsAt } from "./history";
import {
  contributionMonths,
  finalValueOf,
  irr,
  run,
  runLadder,
  runSingle,
  simulateLeg,
  summarize,
  trajectory,
  valueAt,
  valueOf,
  type SimParams,
} from "./simulate";

describe("idToYear", () => {
  it("maps YYYY-MM to a decimal year with month zero-based", () => {
    expect(idToYear("2025-01")).toBe(2025);
    expect(idToYear("2025-02")).toBeCloseTo(2025 + 1 / 12, 12);
    expect(idToYear("2024-12")).toBeCloseTo(2024 + 11 / 12, 12);
  });
});

describe("matsAt", () => {
  it("returns available maturities ascending", () => {
    expect(matsAt("2024-08")).toEqual([1, 5]);
    expect(matsAt("2025-02")).toEqual([1, 3, 5]);
    expect(matsAt("2025-06")).toEqual([2, 4, 6]);
  });
});

describe("couponFor", () => {
  it("returns the exact rate when the target maturity exists", () => {
    expect(couponFor("2025-02", 5, false)).toEqual({ rate: 7.95, mat: 5 });
    expect(couponFor("2025-02", 3, false)).toEqual({ rate: 7.65, mat: 3 });
  });

  it("falls back to the nearest maturity across the 1/3/5 -> 2/4/6 switch", () => {
    // Jun 2025 only offers 2/4/6; a target of 5 snaps to the nearest (4).
    expect(couponFor("2025-06", 5, false)).toEqual({ rate: 7.7, mat: 4 });
    // target 1 snaps to 2
    expect(couponFor("2025-06", 1, false)).toEqual({ rate: 7.35, mat: 2 });
  });

  it("uses the donor tranche at its own maturity when donor is set", () => {
    // Feb 2025's donor tranche is 1-year @ 7.95%.
    expect(couponFor("2025-02", 5, true)).toEqual({ rate: 7.95, mat: 1 });
    // From Jun 2025 the donor tranche moved to 2-year @ 8.35%.
    expect(couponFor("2025-06", 5, true)).toEqual({ rate: 8.35, mat: 2 });
  });

  it("ignores donor for EUR (donor tranches are RON-only)", () => {
    // EUR at Feb 2025 offers 2/7y; target 5 snaps to 7, donor flag has no effect.
    expect(couponFor("2025-02", 5, true, "EUR")).toEqual({ rate: 6.25, mat: 7 });
  });
});

describe("issuanceAtOrAfter", () => {
  it("returns the first issuance at or after the given decimal year", () => {
    expect(issuanceAtOrAfter(2025.0).id).toBe("2025-02");
    expect(issuanceAtOrAfter(idToYear("2025-06")).id).toBe("2025-06");
  });

  it("returns the last issuance when the year is past the table", () => {
    expect(issuanceAtOrAfter(2099).id).toBe("2026-07");
  });
});

describe("simulateLeg — coupon math", () => {
  it("computes a single non-maturing leg's annual coupon", () => {
    // 50000 at 7.95% (Feb 2025, 5y) -> 3975/yr, matures 2030 (> horizon)
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    expect(legs).toHaveLength(1);
    expect(legs[0].rate).toBe(7.95);
    expect(legs[0].couponAnnual).toBeCloseTo(3975, 9);
    expect(legs[0].matured).toBe(false);
    expect(legs[0].couponsPaid).toBe(1);
  });

  it("rolls over and compounds coupons on reinvestment", () => {
    // Oct 2024, 1y at 5.85% -> matures Oct 2025, rolls into next issuance.
    const legs = simulateLeg("2024-10", 50000, 1, false, true);
    expect(legs.length).toBeGreaterThan(1);
    // first leg pays 5.85% of 50000 = 2925; rolled capital = 50000 + 2925 = 52925
    expect(legs[0].couponAnnual).toBeCloseTo(2925, 9);
    expect(legs[1].principal).toBeCloseTo(52925, 9);
  });

  it("does not roll over when reinvest is false", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, false);
    expect(legs).toHaveLength(1);
  });
});

describe("valueOf", () => {
  it("values a matured leg as principal plus all coupons", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, false);
    // 50000 + 2925*1
    expect(valueOf(legs)).toBeCloseTo(52925, 9);
  });

  it("values a running leg with linearly accrued coupon", () => {
    // Feb 2025 5y: elapsed to horizon = END - startY = 1.5 years
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    // 50000 + 3975 * 1.5
    expect(valueOf(legs)).toBeCloseTo(55962.5, 9);
  });
});

describe("valueAt", () => {
  it("is the principal before the leg starts and accrues linearly within it", () => {
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    const startY = legs[0].startY;
    expect(valueAt(legs, startY - 1)).toBeCloseTo(50000, 9);
    expect(valueAt(legs, startY)).toBeCloseTo(50000, 9);
    // half a year in: 50000 + 3975 * 0.5
    expect(valueAt(legs, startY + 0.5)).toBeCloseTo(51987.5, 9);
  });

  it("agrees with valueOf at the horizon", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, true);
    expect(valueAt(legs, END)).toBeCloseTo(valueOf(legs), 9);
  });

  it("returns 0 for an empty chain", () => {
    expect(valueAt([], 2025)).toBe(0);
  });
});

describe("trajectory", () => {
  const base: SimParams = {
    amount: 50000,
    startId: "2025-02",
    strat: "single",
    mat: 5,
    donor: false,
    reinvest: true,
    currency: "RON",
  };

  it("starts at the invested amount and ends at the final value", () => {
    const res = run(base);
    const pts = trajectory(res);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0].value).toBeCloseTo(base.amount, 9);
    expect(pts[pts.length - 1].value).toBeCloseTo(finalValueOf(res), 9);
  });

  it("is sorted in time and non-decreasing in value", () => {
    const pts = trajectory(run({ ...base, startId: "2024-10", mat: 1 }));
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
      expect(pts[i].value).toBeGreaterThanOrEqual(pts[i - 1].value - 1e-9);
    }
  });

  it("sums the value across ladder blocks", () => {
    const res = run({ ...base, amount: 30000, strat: "ladder" });
    const pts = trajectory(res);
    expect(pts[0].value).toBeCloseTo(30000, 9);
    expect(pts[pts.length - 1].value).toBeCloseTo(finalValueOf(res), 9);
  });
});

describe("summarize — CAGR math", () => {
  const base: SimParams = {
    amount: 50000,
    startId: "2025-02",
    strat: "single",
    mat: 5,
    donor: false,
    reinvest: true,
    currency: "RON",
  };

  it("computes final value, profit, horizon years and CAGR", () => {
    const s = summarize(base);
    expect(s.finalValue).toBeCloseTo(55962.5, 9);
    expect(s.profit).toBeCloseTo(5962.5, 9);
    expect(s.years).toBeCloseTo(1.5, 12);
    expect(s.cagr).toBeCloseTo(7.799828196310954, 9);
  });

  it("CAGR is (final/invested)^(1/years) - 1, in percent", () => {
    const s = summarize(base);
    const expected = (Math.pow(s.finalValue / base.amount, 1 / s.years) - 1) * 100;
    expect(s.cagr).toBeCloseTo(expected, 12);
  });

  it("donor tranche summary", () => {
    const s = summarize({ ...base, amount: 10000, mat: 1, donor: true });
    expect(s.finalValue).toBeCloseTo(11180.92125, 9);
    expect(s.cagr).toBeCloseTo(7.7254687252338305, 9);
  });

  it("ladder splits into three equal tranches", () => {
    const res = runLadder({ ...base, amount: 30000, strat: "ladder" });
    expect(res.blocks).toHaveLength(3);
    res.blocks.forEach((b) => expect(b.amount).toBeCloseTo(10000, 9));
    const s = summarize({ ...base, amount: 30000, strat: "ladder" });
    expect(s.finalValue).toBeCloseTo(33363.87125, 9);
    expect(s.cagr).toBeCloseTo(7.342108365729483, 9);
  });

  it("runSingle produces exactly one block", () => {
    expect(runSingle(base).blocks).toHaveLength(1);
  });
});

describe("hold-to-maturity horizon", () => {
  const base: SimParams = {
    amount: 50000,
    startId: "2025-02",
    strat: "single",
    mat: 5,
    donor: false,
    reinvest: false,
    currency: "RON",
  };

  it("runs a single leg its full term (all coupons paid)", () => {
    const legs = simulateLeg("2025-02", 50000, 5, false, false, "RON", "maturity");
    expect(legs).toHaveLength(1);
    expect(legs[0].matured).toBe(true);
    expect(legs[0].couponsPaid).toBe(5); // vs 1 under the "now" horizon
  });

  it("values a held-to-maturity bond at principal + all coupons", () => {
    const s = summarize({ ...base, horizon: "maturity" });
    // 50000 at 7.95% for 5 years = 50000 + 3975*5
    expect(s.finalValue).toBeCloseTo(69875, 9);
    expect(s.years).toBeCloseTo(5, 9);
    expect(s.cagr).toBeCloseTo((Math.pow(69875 / 50000, 1 / 5) - 1) * 100, 9);
  });

  it("is worth at least the mark-to-now value (it holds longer)", () => {
    const now = summarize({ ...base, horizon: "now" });
    const mat = summarize({ ...base, horizon: "maturity" });
    expect(mat.finalValue).toBeGreaterThanOrEqual(now.finalValue - 1e-9);
  });

  it("every leg in a reinvested chain is matured with all coupons paid", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, true, "RON", "maturity");
    expect(legs.length).toBeGreaterThan(1);
    for (const leg of legs) {
      expect(leg.matured).toBe(true);
      expect(leg.couponsPaid).toBe(leg.mat);
    }
  });
});

describe("irr", () => {
  it("recovers a simple one-period return", () => {
    // -100 now, +110 in a year -> 10%
    expect(irr([{ t: 0, cf: -100 }, { t: 1, cf: 110 }])).toBeCloseTo(10, 6);
  });

  it("is money-weighted across two equal contributions", () => {
    // -100 at t0, -100 at t0, +220 at t0+2 -> (1+r)^2 = 1.1
    const r = irr([
      { t: 0, cf: -100 },
      { t: 0, cf: -100 },
      { t: 2, cf: 220 },
    ]);
    expect(r).toBeCloseTo((Math.sqrt(1.1) - 1) * 100, 5);
  });

  it("returns 0 when the flows never turn a profit (no sign-changing root)", () => {
    expect(irr([{ t: 0, cf: -100 }, { t: 1, cf: 100 }])).toBeCloseTo(0, 6);
    expect(irr([])).toBe(0);
  });
});

describe("recurring contribution plans", () => {
  const base: SimParams = {
    amount: 10000,
    startId: "2025-02",
    strat: "single",
    mat: 5,
    donor: false,
    reinvest: false,
    currency: "RON",
    plan: ["2025-02", "2025-03"],
  };

  it("contributionMonths returns the plan when present, else the single start", () => {
    expect(contributionMonths(base)).toEqual(["2025-02", "2025-03"]);
    const { plan: _drop, ...lump } = base;
    expect(contributionMonths(lump)).toEqual(["2025-02"]);
  });

  it("invests the amount at every plan month (one block per month, single strat)", () => {
    expect(run(base).blocks).toHaveLength(2);
    // ladder splits each contribution into three, so N months -> 3N blocks
    expect(run({ ...base, strat: "ladder" }).blocks).toHaveLength(6);
  });

  it("aggregates the final value across contributions", () => {
    // Feb 5y @7.95% -> 10000 + 795*1.5 = 11192.5; Mar 5y @7.80% -> 10000 + 780*(17/12)
    const marAccrued = 780 * (END - (2025 + 2 / 12));
    expect(finalValueOf(run(base))).toBeCloseTo(11192.5 + 10000 + marAccrued, 6);
  });

  it("summarizes invested as amount x contributions and uses a money-weighted return", () => {
    const s = summarize(base);
    expect(s.finalValue).toBeCloseTo(finalValueOf(run(base)), 9);
    expect(s.profit).toBeCloseTo(s.finalValue - 20000, 9); // 2 x 10000 invested
    // money-weighted return is positive and below the lump 5y coupon rate
    expect(s.cagr).toBeGreaterThan(0);
    expect(s.cagr).toBeLessThan(8);
  });

  it("a single-month plan matches the equivalent lump sum", () => {
    const { plan: _drop, ...lump } = base;
    const onePlan = summarize({ ...lump, plan: ["2025-02"] });
    const asLump = summarize(lump);
    expect(onePlan.finalValue).toBeCloseTo(asLump.finalValue, 9);
    expect(onePlan.cagr).toBeCloseTo(asLump.cagr, 9);
  });

  it("trajectory starts at total invested and ends at the final value", () => {
    const res = run(base);
    const pts = trajectory(res);
    expect(pts[0].value).toBeCloseTo(20000, 6);
    expect(pts[pts.length - 1].value).toBeCloseTo(finalValueOf(res), 6);
  });
});
