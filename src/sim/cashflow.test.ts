import { describe, expect, it } from "vitest";
import { END } from "../data/history";
import { couponSchedule, scheduleByYear } from "./cashflow";
import { idToYear } from "./history";
import { run, summarize, type SimParams } from "./simulate";

const params = (over: Partial<SimParams> = {}): SimParams => ({
  amount: 10000,
  startId: "2024-10",
  strat: "single",
  mat: 1,
  donor: false,
  reinvest: false,
  ...over,
});

describe("couponSchedule", () => {
  it("a matured 1-year leg pays exactly one coupon and the principal", () => {
    const p = params();
    const events = couponSchedule(run(p), p);
    const coupons = events.filter((e) => e.kind === "coupon");
    const principals = events.filter((e) => e.kind === "principal");
    expect(coupons).toHaveLength(1);
    expect(principals).toHaveLength(1);
    expect(coupons[0].amount).toBeCloseTo((10000 * 6.0) / 100, 9); // Oct 2024, 1y = 6.0%
    expect(coupons[0].t).toBeCloseTo(idToYear("2024-10") + 1, 9);
    expect(principals[0].amount).toBeCloseTo(10000, 9);
    expect(events.every((e) => !e.reinvested)).toBe(true);
  });

  it("collected coupons equal the profit of a fully-matured non-reinvest run", () => {
    const p = params();
    const events = couponSchedule(run(p), p);
    const collected = events
      .filter((e) => e.kind === "coupon" && !e.reinvested)
      .reduce((s, e) => s + e.amount, 0);
    expect(collected).toBeCloseTo(summarize(p).profit, 9);
  });

  it("marks intermediate legs of a reinvest chain as reinvested", () => {
    const p = params({ reinvest: true });
    const res = run(p);
    expect(res.blocks[0].legs.length).toBeGreaterThan(1); // the chain rolled over
    const events = couponSchedule(res, p);
    const first = res.blocks[0].legs[0];
    const last = res.blocks[0].legs[res.blocks[0].legs.length - 1];
    for (const e of events) {
      if (e.legStartId === first.startId) expect(e.reinvested).toBe(true);
      if (e.legStartId === last.startId) expect(e.reinvested).toBe(false);
    }
  });

  it("the final leg's coupons are collected, not reinvested", () => {
    const p = params({ startId: "2025-02", mat: 5, reinvest: true });
    const events = couponSchedule(run(p), p);
    const coupons = events.filter((e) => e.kind === "coupon");
    expect(coupons.length).toBeGreaterThan(0);
    expect(coupons.every((e) => !e.reinvested)).toBe(true); // single still-running leg
  });

  it("is sorted, capped at the horizon, one coupon per couponsPaid", () => {
    const p = params({ strat: "ladder", startId: "2025-02", reinvest: true });
    const res = run(p);
    const events = couponSchedule(res, p);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
    for (const e of events) expect(e.t).toBeLessThanOrEqual(END + 1e-9);
    const expectedCoupons = res.blocks
      .flatMap((b) => b.legs)
      .reduce((s, leg) => s + leg.couponsPaid, 0);
    expect(events.filter((e) => e.kind === "coupon")).toHaveLength(expectedCoupons);
  });
});

describe("scheduleByYear", () => {
  it("buckets by calendar year with matching totals", () => {
    const p = params({ startId: "2025-02", mat: 5, plan: ["2025-02", "2025-05"] });
    const events = couponSchedule(run(p), p);
    const buckets = scheduleByYear(events);
    expect(buckets.map((b) => b.year)).toEqual([...buckets.map((b) => b.year)].sort((a, b) => a - b));
    const total = buckets.reduce((s, b) => s + b.total, 0);
    expect(total).toBeCloseTo(
      events.reduce((s, e) => s + e.amount, 0),
      9,
    );
    for (const b of buckets) {
      for (const e of b.events) expect(Math.floor(e.t + 1e-9)).toBe(b.year);
    }
  });
});
