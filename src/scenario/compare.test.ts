import { describe, expect, it } from "vitest";
import type { SimParams } from "../sim/simulate";
import {
  bestByCagr,
  boundsOf,
  buildComparison,
  indexPoints,
  seriesCurve,
  type CompareInput,
} from "./compare";

const base: SimParams = {
  amount: 50000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
  currency: "RON",
};

const inputs: CompareInput[] = [
  { id: "a", name: "A", params: base },
  { id: "b", name: "B", params: { ...base, amount: 10000, startId: "2024-10", mat: 1 } },
];

describe("buildComparison", () => {
  it("resolves each scenario into a summary and a value curve", () => {
    const series = buildComparison(inputs);
    expect(series).toHaveLength(2);
    expect(series[0].id).toBe("a");
    expect(series[0].summary.finalValue).toBeCloseTo(55962.5, 6);
    expect(series[0].points[0].value).toBeCloseTo(50000, 6);
    expect(series[0].points[series[0].points.length - 1].value).toBeCloseTo(
      series[0].summary.finalValue,
      6,
    );
  });
});

describe("indexPoints", () => {
  it("rebases the curve so the first point is 100", () => {
    const series = buildComparison(inputs);
    const idx = indexPoints(series[0].points);
    expect(idx[0].value).toBeCloseTo(100, 9);
    // final index = finalValue / invested * 100
    expect(idx[idx.length - 1].value).toBeCloseTo((55962.5 / 50000) * 100, 6);
  });

  it("makes different-sized scenarios directly comparable on one scale", () => {
    // Two scenarios, same params but different amounts, index to the same curve.
    const big = buildComparison([{ id: "x", name: "x", params: { ...base, amount: 90000 } }]);
    const small = buildComparison([{ id: "y", name: "y", params: { ...base, amount: 500 } }]);
    const bi = indexPoints(big[0].points);
    const si = indexPoints(small[0].points);
    expect(bi[bi.length - 1].value).toBeCloseTo(si[si.length - 1].value, 9);
  });

  it("returns an empty array for an empty curve", () => {
    expect(indexPoints([])).toEqual([]);
  });
});

describe("seriesCurve", () => {
  it("returns raw points when not normalized and indexed points when normalized", () => {
    const [s] = buildComparison(inputs);
    expect(seriesCurve(s, false)).toBe(s.points);
    expect(seriesCurve(s, true)[0].value).toBeCloseTo(100, 9);
  });
});

describe("boundsOf", () => {
  it("covers every point of every curve", () => {
    const series = buildComparison(inputs);
    const b = boundsOf(series.map((s) => s.points))!;
    // B starts at 2024-10 (earliest) and everything ends at the horizon
    expect(b.minT).toBeCloseTo(series[1].points[0].t, 9);
    expect(b.minV).toBeLessThanOrEqual(10000);
    expect(b.maxV).toBeCloseTo(55962.5, 6);
  });

  it("returns null when there are no points", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([[], []])).toBeNull();
  });
});

describe("bestByCagr", () => {
  it("picks the series with the highest annualized return", () => {
    const series = buildComparison(inputs);
    const i = bestByCagr(series);
    expect(i).toBeGreaterThanOrEqual(0);
    series.forEach((s) => expect(series[i].summary.cagr).toBeGreaterThanOrEqual(s.summary.cagr));
  });

  it("returns -1 for an empty list", () => {
    expect(bestByCagr([])).toBe(-1);
  });
});
