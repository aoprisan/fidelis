import { describe, expect, it } from "vitest";
import { couponFor, idToYear, issuanceAtOrAfter, matsAt } from "./history";
import { runLadder, runSingle, simulateLeg, summarize, valueOf, type SimParams } from "./simulate";

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

  it("uses the donor tranche when donor is set and available", () => {
    // Feb 2025's donor tranche is 1-year @ 7.95; the donor maturity moved to
    // 2-year only from Jun 2025 (@ 8.35).
    expect(couponFor("2025-02", 5, true)).toEqual({ rate: 7.95, mat: 1 });
    expect(couponFor("2025-06", 5, true)).toEqual({ rate: 8.35, mat: 2 });
  });

  it("resolves the donor tranche for every current issuance (none is null)", () => {
    // The corrected history gives every edition a donor tranche, so donor=true
    // always resolves to it — e.g. Aug 2024's is 1-year @ 6.80.
    expect(couponFor("2024-08", 5, true)).toEqual({ rate: 6.8, mat: 1 });
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

  it("donor 2y tranche summary", () => {
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
