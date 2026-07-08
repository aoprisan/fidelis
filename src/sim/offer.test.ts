import { describe, expect, it } from "vitest";
import { END } from "../data/history";
import { idToYear } from "./history";
import {
  computeOffer,
  contributionIds,
  currentOffer,
  editionRungs,
  wealthCurve,
  type OfferParams,
} from "./offer";

const CUR = currentOffer();

describe("editionRungs", () => {
  it("addresses current RON rungs by rank, donor last", () => {
    const rungs = editionRungs(CUR.id, "RON");
    const slots = rungs.map((r) => r.slot);
    expect(slots[0]).toBe("short");
    expect(slots).toContain("long");
    if (CUR.donorRate != null) {
      const last = rungs[rungs.length - 1];
      expect(last.slot).toBe("donor");
      expect(last.rate).toBe(CUR.donorRate);
      expect(last.minSub).toBe(500);
    }
  });

  it("gives a 3-maturity past edition short/mid/long", () => {
    // Feb 2025 offered 1/3/5y RON.
    const rungs = editionRungs("2025-02", "RON").filter((r) => !r.donor);
    expect(rungs.map((r) => r.mat)).toEqual([1, 3, 5]);
    expect(rungs.map((r) => r.slot)).toEqual(["short", "mid", "long"]);
  });

  it("omits the EUR donor tranche when an edition has none", () => {
    const donor = editionRungs(CUR.id, "EUR").find((r) => r.donor);
    expect(donor ? CUR.donorRateEur != null : CUR.donorRateEur == null).toBe(true);
  });
});

describe("computeOffer — single, hold to maturity", () => {
  const base: OfferParams = { currency: "RON", amount: 10000, mode: "single", pick: "long" };

  it("books annual coupons and principal, paid out (no compounding)", () => {
    const r = computeOffer(base);
    expect(r.allocs).toHaveLength(1);
    const a = r.allocs[0];
    expect(a.couponAnnual).toBeCloseTo(10000 * (a.rate / 100), 6);
    expect(r.totalInterest).toBeCloseTo(a.couponAnnual * a.mat, 6);
    expect(r.finalValue).toBeCloseTo(10000 + a.couponAnnual * a.mat, 6);
    expect(r.flows.filter((f) => f.kind === "coupon")).toHaveLength(a.mat);
    expect(r.flows.filter((f) => f.kind === "principal")).toHaveLength(1);
  });

  it("yields exactly the coupon rate for a single par tranche", () => {
    const r = computeOffer(base);
    expect(r.yieldPct).toBeCloseTo(r.allocs[0].rate, 4);
    expect(r.avgCoupon).toBeCloseTo(r.allocs[0].rate, 6);
  });

  it("defaults an unknown pick to the longest rung", () => {
    const r = computeOffer({ ...base, pick: undefined });
    const rungs = editionRungs(CUR.id, "RON");
    expect(r.allocs[0].mat).toBe(rungs.find((x) => x.slot === "long")!.mat);
  });

  it("can buy the blood-donor tranche", () => {
    const r = computeOffer({ ...base, pick: "donor" });
    expect(r.allocs[0].donor).toBe(true);
    expect(r.allocs[0].rate).toBe(CUR.donorRate);
  });

  it("flags a principal below the tranche minimum", () => {
    expect(computeOffer({ ...base, amount: 100 }).allocs[0].belowMin).toBe(true);
  });
});

describe("computeOffer — ladder weights", () => {
  const ladder: OfferParams = {
    currency: "RON", amount: 30000, mode: "ladder",
    weights: { short: 1, mid: 1, long: 1 },
  };

  it("splits by normalised weights", () => {
    const r = computeOffer(ladder);
    expect(r.allocs).toHaveLength(3);
    for (const a of r.allocs) {
      expect(a.principal).toBeCloseTo(10000, 6);
      expect(a.weightPct).toBeCloseTo(100 / 3, 6);
    }
    expect(r.invested).toBeCloseTo(30000, 6);
  });

  it("honours uneven weights and drops zero-weight rungs", () => {
    const r = computeOffer({
      currency: "RON", amount: 100000, mode: "ladder",
      weights: { short: 40, mid: 0, long: 60 },
    });
    expect(r.allocs).toHaveLength(2);
    expect(r.allocs.find((a) => a.slot === "short")!.principal).toBeCloseTo(40000, 6);
    expect(r.allocs.find((a) => a.slot === "long")!.principal).toBeCloseTo(60000, 6);
  });

  it("blends the yield between the shortest and longest coupon", () => {
    const r = computeOffer(ladder);
    const rates = r.allocs.map((a) => a.rate);
    expect(r.yieldPct).toBeGreaterThan(Math.min(...rates) - 0.05);
    expect(r.yieldPct).toBeLessThan(Math.max(...rates) + 0.05);
  });
});

describe("computeOffer — past editions & recurring", () => {
  it("uses the chosen past edition's coupons", () => {
    const r = computeOffer({ currency: "RON", amount: 10000, mode: "single", startId: "2025-02", pick: "long" });
    expect(r.allocs[0].rate).toBe(7.95); // Feb 2025 5y RON
    expect(r.startYear).toBeCloseTo(idToYear("2025-02"), 6);
  });

  it("recurring invests in every edition from the start onward", () => {
    const ids = contributionIds("2025-02", "monthly");
    const r = computeOffer({ currency: "RON", amount: 1000, mode: "single", startId: "2025-02", contrib: "monthly", pick: "short" });
    expect(r.contributions).toBe(ids.length);
    expect(r.allocs).toHaveLength(ids.length); // single → one rung per contribution
    expect(r.invested).toBeCloseTo(1000 * ids.length, 6);
  });

  it("marks a past plan lower now than at maturity (fewer coupons realised)", () => {
    const p: OfferParams = { currency: "RON", amount: 10000, mode: "single", startId: "2025-02", pick: "long" };
    const now = computeOffer({ ...p, horizon: "now" });
    const mat = computeOffer({ ...p, horizon: "maturity" });
    expect(now.finalValue).toBeLessThan(mat.finalValue);
    expect(now.horizonYear).toBeCloseTo(END, 6);
    expect(now.allocs[0].couponsPaid).toBeLessThan(mat.allocs[0].couponsPaid);
  });
});

describe("wealthCurve", () => {
  it("runs from the start value to finalValue, non-decreasing (lump, maturity)", () => {
    const r = computeOffer({ currency: "RON", amount: 30000, mode: "ladder", weights: { short: 1, mid: 1, long: 1 } });
    const pts = wealthCurve(r);
    expect(pts[0].t).toBeCloseTo(r.startYear, 6);
    expect(pts[0].value).toBeCloseTo(r.invested, 4);
    const last = pts[pts.length - 1];
    expect(last.t).toBeCloseTo(r.horizonYear, 6);
    expect(last.value).toBeCloseTo(r.finalValue, 3);
    for (let i = 1; i < pts.length; i++) expect(pts[i].value).toBeGreaterThanOrEqual(pts[i - 1].value - 1e-6);
  });
});
