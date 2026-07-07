import { describe, expect, it } from "vitest";
import { couponFor, idToYear, issuanceAtOrAfter, matsAt, maxMatAt } from "./history";
import { runLadder, runSingle, simulateLeg, summarize, valueOf, type SimParams } from "./simulate";

describe("idToYear", () => {
  it("maps YYYY-MM to a decimal year with month zero-based", () => {
    expect(idToYear("2025-01")).toBe(2025);
    expect(idToYear("2025-02")).toBeCloseTo(2025 + 1 / 12, 12);
    expect(idToYear("2024-12")).toBeCloseTo(2024 + 11 / 12, 12);
  });
});

describe("matsAt", () => {
  it("returns available RON maturities ascending", () => {
    expect(matsAt("2024-08")).toEqual([1, 5]);
    expect(matsAt("2025-02")).toEqual([1, 3, 5]);
    expect(matsAt("2025-06")).toEqual([2, 4, 6]);
  });

  it("returns EUR maturities when asked", () => {
    expect(matsAt("2024-08", "EUR")).toEqual([1, 5]);
    expect(matsAt("2025-08", "EUR")).toEqual([2, 5, 10]); // 10y EUR premiere
    expect(matsAt("2026-02", "EUR")).toEqual([3, 10]); // 5y EUR omitted that edition
  });
});

describe("maxMatAt", () => {
  it("returns the longest maturity per currency", () => {
    expect(maxMatAt("2025-02")).toBe(5);
    expect(maxMatAt("2025-06")).toBe(6);
    expect(maxMatAt("2025-08", "EUR")).toBe(10);
  });
});

describe("couponFor", () => {
  it("returns the exact RON rate when the target maturity exists", () => {
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

  it("reads the EUR tranche table and ignores donor for EUR", () => {
    // Aug 2025 EUR = {2:3.10, 5:5.25, 10:6.50}.
    expect(couponFor("2025-08", 5, false, "EUR")).toEqual({ rate: 5.25, mat: 5 });
    // Feb 2026 EUR omits the 5y; a target of 5 snaps to the nearest (3, not 10).
    expect(couponFor("2026-02", 5, false, "EUR")).toEqual({ rate: 3.6, mat: 3 });
    // Donor is RON-only, so donor=true on EUR resolves the ordinary EUR pick.
    // Feb 2025 EUR = {2:4.0, 7:6.25}; target 5 snaps to 7.
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

describe("simulateLeg — held to maturity", () => {
  it("holds a single leg to full maturity (all coupons paid)", () => {
    // 50000 at 7.95% (Feb 2025, 5y). The 5y IS the longest tranche, so with
    // reinvest the chain is one leg that runs its full 5-year term.
    const legs = simulateLeg("2025-02", 50000, 5, false, true);
    expect(legs).toHaveLength(1);
    expect(legs[0].rate).toBe(7.95);
    expect(legs[0].couponAnnual).toBeCloseTo(3975, 9); // 50000 * 7.95%
    expect(legs[0].matured).toBe(true);
    expect(legs[0].couponsPaid).toBe(5);
  });

  it("rolls over and compounds coupons on reinvestment", () => {
    // Oct 2024, 1y at 5.85% -> matures Oct 2025, rolls into the next edition
    // (Oct 2025), whose nearest maturity to 1y is the 2y @ 7.20.
    const legs = simulateLeg("2024-10", 50000, 1, false, true);
    expect(legs.length).toBeGreaterThan(1);
    // first leg pays 5.85% of 50000 = 2925; rolled capital = 50000 + 2925 = 52925
    expect(legs[0].couponAnnual).toBeCloseTo(2925, 9);
    expect(legs[1].principal).toBeCloseTo(52925, 9);
    expect(legs[1].rate).toBe(7.2);
    expect(legs[1].mat).toBe(2);
  });

  it("reinvests exactly at maturity (next leg starts where the last ended)", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, true);
    expect(legs[1].startY).toBeCloseTo(legs[0].endY, 9);
  });

  it("does not roll over when reinvest is false", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, false);
    expect(legs).toHaveLength(1);
    expect(legs[0].matured).toBe(true);
  });

  it("holds a EUR leg to maturity from the EUR table", () => {
    // Aug 2025 EUR 5y @ 5.25, no reinvest -> one leg to term.
    const legs = simulateLeg("2025-08", 30000, 5, false, false, "EUR");
    expect(legs).toHaveLength(1);
    expect(legs[0].rate).toBe(5.25);
    expect(legs[0].mat).toBe(5);
    expect(legs[0].couponAnnual).toBeCloseTo(1575, 9); // 30000 * 5.25%
  });
});

describe("valueOf", () => {
  it("values a matured leg as principal plus all its coupons", () => {
    const legs = simulateLeg("2024-10", 50000, 1, false, false);
    // 50000 + 2925 * 1
    expect(valueOf(legs)).toBeCloseTo(52925, 9);
  });

  it("reflects compounded principal across a reinvested chain", () => {
    // Feb 2024 1y @ 6.0 -> Feb 2025 1y @ 6.95 -> Feb 2026 2y @ 6.15 (nearest to
    // 1y once the 1y tranche is gone), horizon = start + longest(3y) = 2027.08,
    // so the 2y leg overshoots to 2028.08 and stops the chain.
    //   leg0: 10000 @ 6.00, coupon 600  -> roll 10600
    //   leg1: 10600 @ 6.95, coupon 736.70 -> roll 11336.70
    //   leg2: 11336.70 @ 6.15 (2y), coupon 697.20705
    //   value = 11336.70 + 697.20705 * 2 = 12731.1141
    const legs = simulateLeg("2024-02", 10000, 1, false, true);
    expect(legs).toHaveLength(3);
    expect(legs[1].principal).toBeCloseTo(10600, 9);
    expect(legs[1].rate).toBe(6.95);
    expect(legs[2].principal).toBeCloseTo(11336.7, 9);
    expect(legs[2].rate).toBe(6.15);
    expect(legs[2].mat).toBe(2);
    expect(valueOf(legs)).toBeCloseTo(12731.1141, 6);
  });
});

/** CAGR by its definition — the check summarize must satisfy. */
const cagrOf = (fv: number, inv: number, years: number) =>
  (Math.pow(fv / inv, 1 / years) - 1) * 100;

describe("summarize — hold-to-maturity figures", () => {
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
    // Single 5y @ 7.95 held to maturity: 50000 + 3975*5 = 69875 over 5 years.
    const s = summarize(base);
    expect(s.finalValue).toBeCloseTo(69875, 9);
    expect(s.profit).toBeCloseTo(19875, 9);
    expect(s.years).toBeCloseTo(5, 12);
    expect(s.cagr).toBeCloseTo(cagrOf(69875, 50000, 5), 9);
  });

  it("CAGR is (final/invested)^(1/years) - 1, in percent", () => {
    const s = summarize(base);
    expect(s.cagr).toBeCloseTo(cagrOf(s.finalValue, base.amount, s.years), 12);
  });

  it("donor tranche summary (single leg, no reinvest)", () => {
    // Feb 2025 donor = 1y @ 7.95 (donorMaturity 1); mat param is ignored.
    const s = summarize({ ...base, amount: 10000, mat: 2, donor: true, reinvest: false });
    expect(s.finalValue).toBeCloseTo(10795, 9); // 10000 + 795
    expect(s.years).toBeCloseTo(1, 12);
    expect(s.cagr).toBeCloseTo(cagrOf(10795, 10000, 1), 9);
  });

  it("ladder splits into three equal tranches valued at their own maturities", () => {
    // Feb 2025 ladder [1y@6.95, 3y@7.65, 5y@7.95], 10000 each, no reinvest.
    //   rung1: 10000 + 695*1  = 10695 (matures y1, then sits as cash)
    //   rung2: 10000 + 765*3  = 12295 (matures y3)
    //   rung3: 10000 + 795*5  = 13975 (matures y5 = horizon)
    //   total = 36965 over 5 years
    const p: SimParams = { ...base, amount: 30000, strat: "ladder", reinvest: false };
    const res = runLadder(p);
    expect(res.blocks).toHaveLength(3);
    res.blocks.forEach((b) => expect(b.amount).toBeCloseTo(10000, 9));
    const s = summarize(p);
    expect(s.finalValue).toBeCloseTo(36965, 9);
    expect(s.years).toBeCloseTo(5, 12);
    expect(s.cagr).toBeCloseTo(cagrOf(36965, 30000, 5), 9);
  });

  it("runSingle produces exactly one block", () => {
    expect(runSingle(base).blocks).toHaveLength(1);
  });

  it("prices an EUR single-issuance run", () => {
    // Aug 2025 EUR 5y @ 5.25 held to maturity: 50000 + 2625*5 = 63125 / 5y.
    const s = summarize({ ...base, startId: "2025-08", currency: "EUR", reinvest: false });
    expect(s.finalValue).toBeCloseTo(63125, 9); // 50000 + (50000*5.25%)*5
    expect(s.years).toBeCloseTo(5, 12);
    expect(s.cagr).toBeCloseTo(cagrOf(63125, 50000, 5), 9);
  });
});
