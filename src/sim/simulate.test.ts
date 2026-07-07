import { describe, expect, it } from "vitest";
import { END } from "../data/history";
import { couponFor, idToYear, issuanceAtOrAfter, matsAt } from "./history";
import {
  finalValueOf,
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
    expect(couponFor("2025-02", 5, false)).toEqual({ rate: 7.7, mat: 5 });
    expect(couponFor("2025-02", 3, false)).toEqual({ rate: 7.4, mat: 3 });
  });

  it("falls back to the nearest maturity across the 1/3/5 -> 2/4/6 switch", () => {
    // Jun 2025 only offers 2/4/6; a target of 5 snaps to the nearest (4).
    expect(couponFor("2025-06", 5, false)).toEqual({ rate: 8.0, mat: 4 });
    // target 1 snaps to 2
    expect(couponFor("2025-06", 1, false)).toEqual({ rate: 7.6, mat: 2 });
  });

  it("uses the donor tranche (2y) when donor is set and available", () => {
    expect(couponFor("2025-02", 5, true)).toEqual({ rate: 8.25, mat: 2 });
  });

  it("ignores donor when that issuance has no donor tranche", () => {
    // Aug 2024 has donor: null
    expect(couponFor("2024-08", 5, true)).toEqual({ rate: 7.0, mat: 5 });
  });
});

describe("issuanceAtOrAfter", () => {
  it("returns the first issuance at or after the given decimal year", () => {
    expect(issuanceAtOrAfter(2025.0).id).toBe("2025-02");
    expect(issuanceAtOrAfter(idToYear("2025-06")).id).toBe("2025-06");
  });

  it("returns the last issuance when the year is past the table", () => {
    expect(issuanceAtOrAfter(2099).id).toBe("2025-12");
  });
});

describe("simulateLeg — coupon math", () => {
  it("computes a single non-maturing leg's annual coupon", () => {
    // 50000 at 7.70% (Feb 2025, 5y) -> 3850/yr, matures 2030 (> horizon)
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    expect(legs).toHaveLength(1);
    expect(legs[0].rate).toBe(7.7);
    expect(legs[0].couponAnnual).toBeCloseTo(3850, 9);
    expect(legs[0].matured).toBe(false);
    expect(legs[0].couponsPaid).toBe(1);
  });

  it("rolls over and compounds coupons on reinvestment", () => {
    // Oct 2024, 1y at 6.00% -> matures Oct 2025, rolls into next issuance.
    const legs = simulateLeg("2024-10", 50000, 1, false, true);
    expect(legs.length).toBeGreaterThan(1);
    // first leg pays 6% of 50000 = 3000; rolled capital = 50000 + 3000 = 53000
    expect(legs[0].couponAnnual).toBeCloseTo(3000, 9);
    expect(legs[1].principal).toBeCloseTo(53000, 9);
  });

  it("does not roll over when reinvest is false", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, false);
    expect(legs).toHaveLength(1);
  });
});

describe("valueOf", () => {
  it("values a matured leg as principal plus all coupons", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, false);
    // 50000 + 3000*1
    expect(valueOf(legs)).toBeCloseTo(53000, 9);
  });

  it("values a running leg with linearly accrued coupon", () => {
    // Feb 2025 5y: elapsed to horizon = END - startY = 1.5 years
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    // 50000 + 3850 * 1.5
    expect(valueOf(legs)).toBeCloseTo(55775, 9);
  });
});

describe("valueAt", () => {
  it("is the principal before the leg starts and accrues linearly within it", () => {
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    const startY = legs[0].startY;
    expect(valueAt(legs, startY - 1)).toBeCloseTo(50000, 9);
    expect(valueAt(legs, startY)).toBeCloseTo(50000, 9);
    // half a year in: 50000 + 3850 * 0.5
    expect(valueAt(legs, startY + 0.5)).toBeCloseTo(51925, 9);
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
  };

  it("computes final value, profit, horizon years and CAGR", () => {
    const s = summarize(base);
    expect(s.finalValue).toBeCloseTo(55775, 9);
    expect(s.profit).toBeCloseTo(5775, 9);
    expect(s.years).toBeCloseTo(1.5, 12);
    expect(s.cagr).toBeCloseTo(7.558907681514748, 9);
  });

  it("CAGR is (final/invested)^(1/years) - 1, in percent", () => {
    const s = summarize(base);
    const expected = (Math.pow(s.finalValue / base.amount, 1 / s.years) - 1) * 100;
    expect(s.cagr).toBeCloseTo(expected, 12);
  });

  it("donor 2y tranche summary", () => {
    const s = summarize({ ...base, amount: 10000, mat: 1, donor: true });
    expect(s.finalValue).toBeCloseTo(11237.5, 9);
    expect(s.cagr).toBeCloseTo(8.088577951636754, 9);
  });

  it("ladder splits into three equal tranches", () => {
    const res = runLadder({ ...base, amount: 30000, strat: "ladder" });
    expect(res.blocks).toHaveLength(3);
    res.blocks.forEach((b) => expect(b.amount).toBeCloseTo(10000, 9));
    const s = summarize({ ...base, amount: 30000, strat: "ladder" });
    expect(s.finalValue).toBeCloseTo(32940, 9);
    expect(s.cagr).toBeCloseTo(6.431020596933856, 9);
  });

  it("runSingle produces exactly one block", () => {
    expect(runSingle(base).blocks).toHaveLength(1);
  });
});
