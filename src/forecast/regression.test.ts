import { describe, expect, it } from "vitest";
import { fitOLS, predict, solve } from "./regression";

describe("solve — linear systems", () => {
  it("solves a 2×2 system", () => {
    // 2x + y = 5 ; x + 3y = 10  ->  x = 1, y = 3
    const x = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    );
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(3, 12);
  });

  it("needs pivoting when the first pivot is zero", () => {
    // 0x + y = 2 ; x + y = 3  ->  x = 1, y = 2
    const x = solve(
      [
        [0, 1],
        [1, 1],
      ],
      [2, 3],
    );
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });

  it("throws on a singular matrix", () => {
    expect(() =>
      solve(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    ).toThrow(/singular/);
  });
});

describe("fitOLS — exact recovery", () => {
  it("recovers an exact linear relation with R² = 1", () => {
    // y = 2 + 3·x₁ − 1·x₂, no noise.
    const X = [
      [1, 1],
      [2, 0],
      [3, 4],
      [0, 2],
      [5, 5],
    ];
    const y = X.map(([a, b]) => 2 + 3 * a - 1 * b);
    const reg = fitOLS(X, y, ["a", "b"]);
    expect(reg.coef[0]).toBeCloseTo(2, 9);
    expect(reg.coef[1]).toBeCloseTo(3, 9);
    expect(reg.coef[2]).toBeCloseTo(-1, 9);
    expect(reg.r2).toBeCloseTo(1, 9);
    expect(reg.rmse).toBeCloseTo(0, 9);
    expect(reg.n).toBe(5);
    expect(reg.p).toBe(2);
  });

  it("fits a simple-regression slope/intercept the classic way", () => {
    // Points (1,1),(2,2),(3,2) -> slope 0.5, intercept 2/3.
    const reg = fitOLS([[1], [2], [3]], [1, 2, 2], ["x"]);
    expect(reg.coef[1]).toBeCloseTo(0.5, 9);
    expect(reg.coef[0]).toBeCloseTo(2 / 3, 9);
    // residuals sum to ~0 for an OLS fit with intercept.
    expect(reg.residuals.reduce((s, r) => s + r, 0)).toBeCloseTo(0, 9);
  });

  it("validates shapes", () => {
    expect(() => fitOLS([], [], ["x"])).toThrow(/no observations/);
    expect(() => fitOLS([[1]], [1, 2], ["x"])).toThrow(/length mismatch/);
    expect(() => fitOLS([[1, 2]], [1], ["x"])).toThrow(/one value per term/);
  });
});

describe("predict", () => {
  it("evaluates β₀ + Σ βⱼ·xⱼ", () => {
    const reg = fitOLS(
      [
        [1, 1],
        [2, 0],
        [3, 4],
        [0, 2],
      ],
      [
        [1, 1],
        [2, 0],
        [3, 4],
        [0, 2],
      ].map(([a, b]) => 2 + 3 * a - 1 * b),
      ["a", "b"],
    );
    expect(predict(reg, [10, 10])).toBeCloseTo(2 + 3 * 10 - 10, 9);
  });

  it("rejects a wrong-length predictor vector", () => {
    const reg = fitOLS([[1], [2]], [1, 2], ["x"]);
    expect(() => predict(reg, [1, 2])).toThrow(/expected 1 predictors/);
  });
});
