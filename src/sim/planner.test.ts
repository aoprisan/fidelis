import { describe, expect, it } from "vitest";
import { idToYear } from "./history";
import {
  DONOR_MIN,
  MIN_BUY,
  irr,
  issuanceForMonth,
  pickMaturity,
  plan,
  type PlanParams,
} from "./planner";

const base: PlanParams = {
  monthly: 1000,
  horizonYears: 3,
  startId: "2025-02",
  risk: "balanced",
  donorEligible: false,
  reinvest: true,
  currency: "RON",
};

describe("pickMaturity", () => {
  it("selects shortest / middle / longest per risk", () => {
    expect(pickMaturity([1, 3, 5], "short")).toBe(1);
    expect(pickMaturity([1, 3, 5], "balanced")).toBe(3);
    expect(pickMaturity([1, 3, 5], "long")).toBe(5);
    expect(pickMaturity([2, 4, 6], "balanced")).toBe(4);
  });

  it("handles two-maturity editions", () => {
    expect(pickMaturity([1, 5], "short")).toBe(1);
    expect(pickMaturity([1, 5], "balanced")).toBe(5); // floor(2/2) = index 1
    expect(pickMaturity([1, 5], "long")).toBe(5);
  });
});

describe("issuanceForMonth", () => {
  it("returns the edition current in that month (latest at or before)", () => {
    expect(issuanceForMonth(idToYear("2025-02")).id).toBe("2025-02");
    // a month with no fresh edition falls back to the last one issued
    expect(issuanceForMonth(idToYear("2025-02") + 0.5 / 12).id).toBe("2025-02");
  });

  it("clamps before the first and after the last issuance", () => {
    expect(issuanceForMonth(2000).id).toBe("2024-02");
    expect(issuanceForMonth(2099).id).toBe("2026-07");
  });
});

describe("irr", () => {
  it("recovers a known single-period rate", () => {
    // -100 now, +110 in one year => 10%
    expect(irr([{ t: 0, amount: -100 }, { t: 1, amount: 110 }])).toBeCloseTo(10, 6);
  });

  it("returns 0 when there is no bracketed root", () => {
    expect(irr([{ t: 0, amount: 100 }, { t: 1, amount: 100 }])).toBe(0);
    expect(irr([])).toBe(0);
  });
});

describe("plan — single-month, exact math", () => {
  // One month of horizon => one 1000-RON contribution, held ~1/12 year.
  const p: PlanParams = { ...base, horizonYears: 1 / 12, risk: "short" };
  const r = plan(p);

  it("makes exactly one purchase at the shortest maturity", () => {
    expect(r.purchases).toHaveLength(1);
    const buy = r.purchases[0];
    expect(buy.buyId).toBe("2025-02");
    expect(buy.mat).toBe(1); // shortest of [1,3,5]
    expect(buy.rate).toBe(6.95);
    expect(buy.amount).toBe(1000);
    expect(buy.donor).toBe(false);
  });

  it("values the live holding with linear coupon accrual", () => {
    // 1000 + 1000*6.95% * (1/12)
    const expected = 1000 + (1000 * 6.95) / 100 / 12;
    expect(r.finalValue).toBeCloseTo(expected, 9);
    expect(r.profit).toBeCloseTo(expected - 1000, 9);
    expect(r.contributed).toBe(1000);
    expect(r.years).toBeCloseTo(1 / 12, 12);
  });

  it("annualizes the return money-weighted", () => {
    // one -1000 @ t0, one +finalValue @ t=1/12  =>  (final/1000)^12 - 1
    const expected = (Math.pow(r.finalValue / 1000, 12) - 1) * 100;
    expect(r.cagr).toBeCloseTo(expected, 6);
  });

  it("has no schedule events before any anniversary", () => {
    expect(r.schedule).toHaveLength(0);
  });
});

describe("plan — contributions and buys", () => {
  it("contributes monthly across the whole horizon", () => {
    const r = plan(base);
    const N = Math.round(base.horizonYears * 12);
    expect(r.contributed).toBe(base.monthly * N);
    // one buy per month while the pool clears MIN_BUY
    expect(r.purchases).toHaveLength(N);
  });

  it("grows a positive tax-free profit at positive coupons", () => {
    const r = plan(base);
    expect(r.finalValue).toBeGreaterThan(r.contributed);
    expect(r.cagr).toBeGreaterThan(0);
  });

  it("books a maturity on the schedule when a tranche comes due in-horizon", () => {
    // shortest (1y) tranche bought month 0 matures exactly at month 12.
    const r = plan({ ...base, horizonYears: 2, risk: "short" });
    const principals = r.schedule.filter((e) => e.kind === "principal");
    expect(principals.length).toBeGreaterThan(0);
    expect(principals[0].fromId).toBe("2025-02");
  });

  it("accumulates the pool when the monthly is below MIN_BUY", () => {
    const small = plan({ ...base, monthly: MIN_BUY / 2, horizonYears: 1, reinvest: false });
    // every other month the pool crosses MIN_BUY and a buy happens
    expect(small.purchases.length).toBeLessThan(12);
    small.purchases.forEach((b) => expect(b.amount).toBeGreaterThanOrEqual(MIN_BUY));
  });
});

describe("plan — reinvest toggle", () => {
  it("marks in-horizon returns as reinvested only when reinvesting", () => {
    const on = plan({ ...base, horizonYears: 2, risk: "short", reinvest: true });
    const off = plan({ ...base, horizonYears: 2, risk: "short", reinvest: false });
    // an anniversary strictly before the horizon
    const onEarly = on.schedule.find((e) => e.month < 24);
    const offEarly = off.schedule.find((e) => e.month < 24);
    expect(onEarly?.reinvested).toBe(true);
    expect(offEarly?.reinvested).toBe(false);
  });

  it("reinvesting beats withdrawing over the same horizon", () => {
    const on = plan({ ...base, horizonYears: 3, reinvest: true });
    const off = plan({ ...base, horizonYears: 3, reinvest: false });
    expect(on.finalValue).toBeGreaterThan(off.finalValue);
  });
});

describe("plan — donor edge", () => {
  it("buys the donor tranche when it dominates the risk pick", () => {
    // Feb 2025: short pick = 1y @ 6.95, donor = 2y @ 7.95  => donor dominates
    const r = plan({ ...base, horizonYears: 1, risk: "short", donorEligible: true });
    const buy = r.purchases[0];
    expect(buy.donor).toBe(true);
    expect(buy.mat).toBe(1); // 2025-02 donorMaturity is 1
    expect(buy.donorEdge).toBeCloseTo(1.0, 9); // 7.95 - 6.95
    expect(r.donorUsedCount).toBeGreaterThan(0);
    expect(r.donorAvgEdge).toBeCloseTo(1.0, 9);
  });

  it("does not use the donor tranche when the risk pick already ties or wins", () => {
    // long pick at Feb 2025 = 5y @ 7.95, equal to the donor 7.95 => no domination
    const r = plan({ ...base, horizonYears: 1 / 12, risk: "long", donorEligible: true });
    expect(r.purchases[0].donor).toBe(false);
    expect(r.donorUsedCount).toBe(0);
  });

  it("surfaces the 500-RON minimum as a blocker", () => {
    // pool never clears DONOR_MIN, yet the donor tranche would dominate
    const r = plan({
      ...base,
      monthly: DONOR_MIN - 100,
      horizonYears: 1,
      risk: "short",
      donorEligible: true,
    });
    expect(r.donorUsedCount).toBe(0);
    expect(r.donorBlockedCount).toBeGreaterThan(0);
    r.purchases.forEach((b) => expect(b.donor).toBe(false));
  });
});

describe("plan — EUR currency", () => {
  it("buys from the EUR tranche table and never fires the donor tranche", () => {
    // Aug 2025 EUR = {2:3.10, 5:5.25, 10:6.50}; balanced pick = 5y @ 5.25.
    const r = plan({
      ...base,
      startId: "2025-08",
      horizonYears: 1 / 12,
      risk: "balanced",
      currency: "EUR",
      donorEligible: true, // ignored: donor tranches are RON-only
    });
    expect(r.purchases[0].rate).toBeCloseTo(5.25, 9);
    expect(r.purchases[0].mat).toBe(5);
    expect(r.purchases[0].donor).toBe(false);
    expect(r.donorUsedCount).toBe(0);
    expect(r.donorBlockedCount).toBe(0);
  });
});

describe("plan — determinism", () => {
  it("is a pure function of its inputs", () => {
    const a = plan(base);
    const b = plan({ ...base });
    expect(a).toEqual(b);
  });
});
