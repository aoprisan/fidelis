import { describe, expect, it } from "vitest";
import { BENCHMARKS, DEPOSIT_TAX } from "../data/benchmarks";
import { END } from "../data/history";
import {
  benchmarkAt,
  benchmarkSummary,
  deflate,
  depositTaxOf,
  depositTrajectory,
} from "./benchmark";
import { idToYear } from "./history";
import { run, trajectory, type SimParams, type ValuePoint } from "./simulate";

const lump = (over: Partial<SimParams> = {}): SimParams => ({
  amount: 10000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
  ...over,
});

describe("benchmark data", () => {
  it("covers every month from 2024-08 to 2026-07, sorted, plausible", () => {
    expect(BENCHMARKS[0].id).toBe("2024-08");
    expect(BENCHMARKS[BENCHMARKS.length - 1].id).toBe("2026-07");
    for (let i = 1; i < BENCHMARKS.length; i++) {
      const prev = idToYear(BENCHMARKS[i - 1].id);
      const cur = idToYear(BENCHMARKS[i].id);
      expect(cur - prev).toBeCloseTo(1 / 12, 9); // dense monthly series
      expect(BENCHMARKS[i].cpiIndex).toBeGreaterThanOrEqual(BENCHMARKS[i - 1].cpiIndex);
    }
    for (const b of BENCHMARKS) {
      expect(b.depositRate).toBeGreaterThan(0);
      expect(b.depositRate).toBeLessThan(15);
      expect(b.cpiIndex).toBeGreaterThan(0);
    }
    // the last row reaches the simulation horizon
    expect(idToYear(BENCHMARKS[BENCHMARKS.length - 1].id)).toBeGreaterThanOrEqual(END - 1 / 12);
  });

  it("benchmarkAt returns the last observation at or before t", () => {
    expect(benchmarkAt(idToYear("2025-02")).id).toBe("2025-02");
    expect(benchmarkAt(idToYear("2025-02") + 0.04).id).toBe("2025-02");
    expect(benchmarkAt(2000).id).toBe("2024-08"); // before the series: first row
    expect(benchmarkAt(3000).id).toBe("2026-07"); // after the series: last row
  });
});

describe("depositTrajectory", () => {
  it("matches the hand-computed 1-year taxed deposit", () => {
    const p = lump({ amount: 10000, startId: "2025-02" });
    const t0 = idToYear("2025-02");
    const r = benchmarkAt(t0).depositRate;
    const points = depositTrajectory(p);
    const oneYear = points.find((pt) => Math.abs(pt.t - (t0 + 1)) < 1e-9);
    expect(oneYear).toBeDefined();
    expect(oneYear!.value).toBeCloseTo(10000 + ((10000 * r) / 100) * (1 - DEPOSIT_TAX), 9);
  });

  it("starts at the invested amount and is monotonically non-decreasing to END", () => {
    const points = depositTrajectory(lump());
    expect(points[0].value).toBeCloseTo(10000, 9);
    expect(points[0].t).toBeCloseTo(idToYear("2025-02"), 9);
    expect(points[points.length - 1].t).toBeCloseTo(END, 9);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].value).toBeGreaterThanOrEqual(points[i - 1].value - 1e-9);
    }
  });

  it("a recurring plan equals the sum of per-month single deposits", () => {
    const plan = ["2025-02", "2025-05", "2025-08"];
    const rec = depositTrajectory(lump({ startId: plan[0], plan }));
    const final = rec[rec.length - 1].value;
    const sum = plan
      .map((id) => {
        const pts = depositTrajectory(lump({ startId: id }));
        return pts[pts.length - 1].value;
      })
      .reduce((a, b) => a + b, 0);
    expect(final).toBeCloseTo(sum, 6);
  });

  it("depositTaxOf recovers the 10% withheld from the net gain", () => {
    const p = lump();
    const points = depositTrajectory(p);
    const netGain = points[points.length - 1].value - p.amount;
    expect(depositTaxOf(p)).toBeCloseTo((netGain * DEPOSIT_TAX) / (1 - DEPOSIT_TAX), 9);
    expect(depositTaxOf(p)).toBeGreaterThan(0);
  });
});

describe("deflate", () => {
  it("keeps the first point and shrinks later ones under rising CPI", () => {
    const t0 = idToYear("2024-08");
    const nominal: ValuePoint[] = [
      { t: t0, value: 1000 },
      { t: END, value: 1000 },
    ];
    const real = deflate(nominal);
    expect(real[0].value).toBeCloseTo(1000, 9);
    expect(real[1].value).toBeLessThan(1000); // CPI rose over the window
    const factor = benchmarkAt(t0).cpiIndex / benchmarkAt(END).cpiIndex;
    expect(real[1].value).toBeCloseTo(1000 * factor, 9);
  });

  it("is the identity on an empty curve", () => {
    expect(deflate([])).toEqual([]);
  });
});

describe("benchmarkSummary", () => {
  it("Fidelis beats the taxed deposit for the default scenario", () => {
    const p = lump({ amount: 50000 });
    const points = trajectory(run(p));
    const s = benchmarkSummary(p, points);
    expect(s.advantage).toBeGreaterThan(0);
    expect(s.depositFinal).toBeLessThan(points[points.length - 1].value);
  });

  it("taxSaved is 10% of the Fidelis profit", () => {
    const p = lump();
    const points = trajectory(run(p));
    const profit = points[points.length - 1].value - p.amount;
    expect(benchmarkSummary(p, points).taxSaved).toBeCloseTo(DEPOSIT_TAX * profit, 9);
  });

  it("real profit is below nominal profit under rising prices", () => {
    const p = lump();
    const points = trajectory(run(p));
    const s = benchmarkSummary(p, points);
    const nominalProfit = points[points.length - 1].value - p.amount;
    expect(s.realProfit).toBeLessThan(nominalProfit);
    expect(s.realFinal).toBeLessThan(points[points.length - 1].value);
  });
});
