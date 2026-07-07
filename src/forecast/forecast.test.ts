import { describe, expect, it } from "vitest";
import { predict } from "./regression";
import {
  applyScenario,
  buildObservations,
  couponRange,
  defaultBase,
  fitModel,
  forecast,
  FORECAST_TENORS,
  SCENARIOS,
  TERMS,
  tenorBands,
} from "./forecast";

describe("buildObservations", () => {
  it("joins every RON coupon to its macro conditions", () => {
    const obs = buildObservations();
    // 12 issuances; coupon counts 2+3+3+3+3+3+3+3+3+3+3+3 = 35.
    expect(obs).toHaveLength(35);
    // Every observation carries all three macro drivers and a tenor.
    obs.forEach((o) => {
      expect(Number.isFinite(o.nbr)).toBe(true);
      expect(Number.isFinite(o.cpi)).toBe(true);
      expect(Number.isFinite(o.eurRon)).toBe(true);
      expect(o.tenor).toBeGreaterThan(0);
      expect(o.coupon).toBeGreaterThan(0);
    });
  });

  it("uses the real coupon and macro values for a known row", () => {
    const obs = buildObservations();
    // Feb 2025, 5y coupon 7.7 at NBR 6.5 / CPI 5.0 / EUR-RON 4.977.
    const row = obs.find((o) => o.id === "2025-02" && o.tenor === 5);
    expect(row).toMatchObject({ coupon: 7.7, nbr: 6.5, cpi: 5.0, eurRon: 4.977 });
  });
});

describe("fitModel", () => {
  const reg = fitModel();

  it("fits four predictors plus an intercept", () => {
    expect(reg.terms).toEqual(TERMS);
    expect(reg.coef).toHaveLength(5);
    expect(reg.n).toBe(35);
    expect(reg.p).toBe(4);
  });

  it("reproduces the fitted coefficients (golden)", () => {
    // Regenerate with the probe if the data or model spec changes.
    expect(reg.coef[0]).toBeCloseTo(-14.65238, 4); // intercept
    expect(reg.coef[1]).toBeCloseTo(-2.174864, 4); // NBR
    expect(reg.coef[2]).toBeCloseTo(-0.2263, 4); // CPI
    expect(reg.coef[3]).toBeCloseTo(7.283688, 4); // EUR/RON
    expect(reg.coef[4]).toBeCloseTo(0.23946, 4); // tenor (term premium ≈ 0.24pp/yr)
  });

  it("reports a plausible in-sample fit", () => {
    expect(reg.r2).toBeCloseTo(0.755358, 4);
    expect(reg.rmse).toBeCloseTo(0.278753, 4);
    // residuals of an intercept model sum to ~0.
    expect(reg.residuals.reduce((s, r) => s + r, 0)).toBeCloseTo(0, 6);
  });

  it("prices the term premium: longer tenor => higher coupon", () => {
    const at = (tenor: number) => predict(reg, [6.5, 7.9, 5.1, tenor]);
    expect(at(6)).toBeGreaterThan(at(4));
    expect(at(4)).toBeGreaterThan(at(2));
  });
});

describe("couponRange", () => {
  it("returns the historical support of the response", () => {
    expect(couponRange()).toEqual({ min: 5.8, max: 8.2 });
  });
});

describe("scenarios", () => {
  it("defines exactly base/low/high with base as the zero-shift", () => {
    expect(SCENARIOS.map((s) => s.key)).toEqual(["low", "base", "high"]);
    const base = SCENARIOS.find((s) => s.key === "base")!;
    expect([base.dNbr, base.dCpi, base.dEurRon]).toEqual([0, 0, 0]);
  });

  it("applyScenario shifts every driver by the stated deltas", () => {
    const high = SCENARIOS.find((s) => s.key === "high")!;
    const a = applyScenario(defaultBase, high);
    expect(a.nbr).toBeCloseTo(defaultBase.nbr + high.dNbr, 12);
    expect(a.cpi).toBeCloseTo(defaultBase.cpi + high.dCpi, 12);
    expect(a.eurRon).toBeCloseTo(defaultBase.eurRon + high.dEurRon, 12);
  });
});

describe("forecast", () => {
  const reg = fitModel();
  const fc = forecast(reg, defaultBase);

  it("returns one forecast per scenario, each pricing every tenor", () => {
    expect(fc.map((f) => f.key)).toEqual(["low", "base", "high"]);
    fc.forEach((f) => {
      expect(f.coupons.map((c) => c.tenor)).toEqual([...FORECAST_TENORS]);
    });
  });

  it("each scenario coupon equals predict() on its assumption (no hidden math)", () => {
    fc.forEach((f) => {
      f.coupons.forEach((c) => {
        const direct = predict(reg, [f.assumption.nbr, f.assumption.cpi, f.assumption.eurRon, c.tenor]);
        expect(c.coupon).toBeCloseTo(direct, 12);
      });
    });
  });

  it("reproduces the base-scenario coupons (golden)", () => {
    const base = fc.find((f) => f.key === "base")!;
    const byTenor = Object.fromEntries(base.coupons.map((c) => [c.tenor, c.coupon]));
    expect(byTenor[2]).toBeCloseTo(7.048967, 4);
    expect(byTenor[4]).toBeCloseTo(7.527888, 4);
    expect(byTenor[6]).toBeCloseTo(8.006808, 4);
  });
});

describe("tenorBands", () => {
  const fc = forecast(fitModel(), defaultBase);
  const bands = tenorBands(fc);

  it("produces a min<=max band per tenor", () => {
    expect(bands.map((b) => b.tenor)).toEqual([...FORECAST_TENORS]);
    bands.forEach((b) => expect(b.min).toBeLessThanOrEqual(b.max));
  });

  it("flags extrapolation when a band escapes the historical support", () => {
    // 2y band (6.64–7.83) sits inside [5.8, 8.2]; 6y band (7.59–8.78) exceeds it.
    const b2 = bands.find((b) => b.tenor === 2)!;
    const b6 = bands.find((b) => b.tenor === 6)!;
    expect(b2.extrapolated).toBe(false);
    expect(b6.extrapolated).toBe(true);
  });
});
