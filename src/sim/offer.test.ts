import { describe, expect, it } from "vitest";
import {
  computeOffer,
  currentOffer,
  offerTranches,
  wealthCurve,
  type OfferParams,
} from "./offer";

const OFFER = currentOffer();

describe("currentOffer / offerTranches", () => {
  it("returns the most recent edition", () => {
    // The fixture's last row is the current offer; guard that ordering holds.
    expect(OFFER.id >= "2026-07").toBe(true);
  });

  it("lists standard RON tranches ascending, donor appended", () => {
    const ts = offerTranches("RON");
    const std = ts.filter((t) => !t.donor).map((t) => t.mat);
    expect([...std].sort((a, b) => a - b)).toEqual(std); // already ascending
    const donor = ts.find((t) => t.donor);
    if (OFFER.donorRate != null) {
      expect(donor).toBeDefined();
      expect(donor!.rate).toBe(OFFER.donorRate);
      expect(donor!.minSub).toBe(500);
    }
  });

  it("omits the donor tranche for EUR when the edition has none", () => {
    const ts = offerTranches("EUR");
    const donor = ts.find((t) => t.donor);
    expect(donor ? OFFER.donorRateEur != null : OFFER.donorRateEur == null).toBe(true);
  });
});

describe("computeOffer — single tranche", () => {
  const base: OfferParams = { currency: "RON", amount: 10000, mode: "single", pick: "4" };

  it("books annual coupons and principal, paid out (no compounding)", () => {
    const r = computeOffer(base);
    const rung = r.rungs[0];
    expect(r.rungs).toHaveLength(1);
    expect(rung.mat).toBe(4);
    expect(rung.annualCoupon).toBeCloseTo(10000 * (rung.rate / 100), 6);
    expect(rung.totalInterest).toBeCloseTo(rung.annualCoupon * 4, 6);
    expect(r.finalValue).toBeCloseTo(10000 + rung.totalInterest, 6);
    // one coupon per year + one principal
    expect(r.flows.filter((f) => f.kind === "coupon")).toHaveLength(4);
    expect(r.flows.filter((f) => f.kind === "principal")).toHaveLength(1);
  });

  it("yields exactly the coupon rate for a single par tranche", () => {
    const r = computeOffer(base);
    expect(r.yieldPct).toBeCloseTo(r.rungs[0].rate, 4);
    expect(r.avgCoupon).toBeCloseTo(r.rungs[0].rate, 6);
  });

  it("defaults to the first tranche on an unknown pick", () => {
    const r = computeOffer({ ...base, pick: "nope" });
    expect(r.rungs[0].key).toBe(offerTranches("RON")[0].key);
  });

  it("flags a principal below the tranche minimum", () => {
    const r = computeOffer({ ...base, amount: 100 });
    expect(r.rungs[0].belowMin).toBe(true);
  });
});

describe("computeOffer — ladder", () => {
  const rungKeys = offerTranches("RON")
    .filter((t) => !t.donor)
    .map((t) => t.key);
  const weights = Object.fromEntries(rungKeys.map((k) => [k, 1]));
  const ladder: OfferParams = { currency: "RON", amount: 30000, mode: "ladder", weights };

  it("splits by normalised weights", () => {
    const r = computeOffer(ladder);
    expect(r.rungs).toHaveLength(rungKeys.length);
    const per = 30000 / rungKeys.length;
    for (const rung of r.rungs) {
      expect(rung.principal).toBeCloseTo(per, 6);
      expect(rung.weightPct).toBeCloseTo(100 / rungKeys.length, 6);
    }
    expect(r.invested).toBeCloseTo(30000, 6);
  });

  it("honours uneven weights", () => {
    const [a, b, c] = rungKeys;
    const r = computeOffer({
      currency: "RON", amount: 100000, mode: "ladder",
      weights: { [a]: 40, [b]: 30, [c]: 30 },
    });
    const ra = r.rungs.find((x) => x.key === a)!;
    expect(ra.principal).toBeCloseTo(40000, 6);
    expect(ra.weightPct).toBeCloseTo(40, 6);
  });

  it("falls back to an equal standard split when no weight is positive", () => {
    const r = computeOffer({ currency: "RON", amount: 30000, mode: "ladder", weights: {} });
    expect(r.rungs.every((x) => !x.donor)).toBe(true);
    expect(r.rungs).toHaveLength(rungKeys.length);
  });

  it("blends the yield between the shortest and longest coupon", () => {
    const r = computeOffer(ladder);
    const rates = r.rungs.map((x) => x.rate);
    expect(r.yieldPct).toBeGreaterThan(Math.min(...rates) - 0.01);
    expect(r.yieldPct).toBeLessThan(Math.max(...rates) + 0.01);
    expect(r.avgCoupon).toBeCloseTo(
      r.rungs.reduce((s, x) => s + x.principal * x.rate, 0) / r.invested,
      6,
    );
  });
});

describe("wealthCurve", () => {
  it("rises from invested to finalValue, one point per year", () => {
    const r = computeOffer({ currency: "RON", amount: 30000, mode: "ladder",
      weights: Object.fromEntries(offerTranches("RON").filter((t) => !t.donor).map((t) => [t.key, 1])) });
    const pts = wealthCurve(r);
    expect(pts[0]).toEqual({ t: 0, value: r.invested });
    expect(pts).toHaveLength(r.horizonYears + 1);
    expect(pts[pts.length - 1].value).toBeCloseTo(r.finalValue, 4);
    // monotonic non-decreasing
    for (let i = 1; i < pts.length; i++) expect(pts[i].value).toBeGreaterThanOrEqual(pts[i - 1].value);
  });
});
