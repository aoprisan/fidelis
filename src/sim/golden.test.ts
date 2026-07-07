/**
 * Regression guard over the full scenario matrix (every start date x strategy x
 * donor x reinvest x currency) plus a few detailed leg dumps.
 * `__fixtures__/golden.json` was re-baselined when the redesign branch merged
 * into main: the CORRECTED MF rate history + EUR tranches + 2026 data, run
 * through main's END-anchored horizon model (each leg accrues/matures relative
 * to `END`, mid-2026). It locks in that baseline: if any output changes, an
 * observed output changed. Regenerate it deliberately (never to silence a
 * failure) when a rate or the math intentionally changes.
 */
import { describe, expect, it } from "vitest";
import { run, summarize, type SimParams } from "./simulate";
import golden from "./__fixtures__/golden.json";

interface Out {
  finalValue: number;
  profit: number;
  years: number;
  cagr: number;
}
interface Case {
  S: SimParams;
  out: Out;
}
interface Detail {
  S: SimParams;
  res: { blocks: { legs: Record<string, unknown>[]; amount: number }[] };
  out: Out;
}

const data = golden as unknown as { cases: Case[]; details: Detail[] };

const label = (S: SimParams) =>
  `${S.startId} ${S.currency} ${S.strat} donor=${S.donor} reinvest=${S.reinvest} mat=${S.mat} amount=${S.amount}`;

describe("golden regression — summary figures", () => {
  it.each(data.cases.map((c) => [label(c.S), c] as const))("%s", (_name, c) => {
    const s = summarize(c.S);
    expect(s.finalValue).toBeCloseTo(c.out.finalValue, 9);
    expect(s.profit).toBeCloseTo(c.out.profit, 9);
    expect(s.years).toBeCloseTo(c.out.years, 9);
    expect(s.cagr).toBeCloseTo(c.out.cagr, 9);
  });
});

describe("golden regression — full leg detail", () => {
  it.each(data.details.map((d) => [label(d.S), d] as const))("%s", (_name, d) => {
    const res = run(d.S);
    // structure matches
    expect(res.blocks).toHaveLength(d.res.blocks.length);
    res.blocks.forEach((block, bi) => {
      const golden = d.res.blocks[bi];
      expect(block.amount).toBeCloseTo(golden.amount, 9);
      expect(block.legs).toHaveLength(golden.legs.length);
      block.legs.forEach((leg, li) => {
        const g = golden.legs[li] as Record<string, unknown>;
        expect(leg.startId).toBe(g.startId);
        expect(leg.startLabel).toBe(g.startLabel);
        expect(leg.mat).toBe(g.mat);
        expect(leg.rate).toBeCloseTo(g.rate as number, 9);
        expect(leg.principal).toBeCloseTo(g.principal as number, 9);
        expect(leg.startY).toBeCloseTo(g.startY as number, 9);
        expect(leg.endY).toBeCloseTo(g.endY as number, 9);
        expect(leg.couponsPaid).toBe(g.couponsPaid);
        expect(leg.couponAnnual).toBeCloseTo(g.couponAnnual as number, 9);
        expect(leg.matured).toBe(g.matured);
      });
    });
    const s = summarize(d.S);
    expect(s.finalValue).toBeCloseTo(d.out.finalValue, 9);
    expect(s.cagr).toBeCloseTo(d.out.cagr, 9);
  });
});
