/**
 * A tiny, transparent ordinary-least-squares (OLS) multiple linear regression.
 *
 * Deliberately NOT a black box: it is a few dozen lines of plain arithmetic —
 * build the normal equations XᵀX β = Xᵀy and solve them by Gauss–Jordan
 * elimination. Every coefficient is directly interpretable ("holding the others
 * fixed, a +1 unit change in this predictor moves the response by β units"),
 * and the fit ships its own residuals, R² and RMSE so the caller can judge how
 * much (or how little) to trust it.
 *
 * The only preprocessing is mean-centering the predictors before solving — a
 * numerical-stability step that is required here because two of the drivers
 * (the policy rate and EUR/RON) barely move in the sample and would otherwise
 * make XᵀX near-singular. Centering does not change the slope coefficients, and
 * we convert the intercept back to raw units before returning, so every
 * coefficient still reads in the predictor's own units. No regularization, no
 * standardization of scale, nothing hidden.
 */

/** A fitted OLS model, fully inspectable. */
export interface Regression {
  /** Predictor names, in the order of `coef[1..]` (intercept excluded). */
  readonly terms: readonly string[];
  /** Coefficients `[intercept, β₁, β₂, …]`, aligned to `terms`. */
  readonly coef: readonly number[];
  /** Fitted values ŷ for each training row. */
  readonly fitted: readonly number[];
  /** Residuals (y − ŷ) for each training row. */
  readonly residuals: readonly number[];
  /** Coefficient of determination, R² ∈ (−∞, 1]. */
  readonly r2: number;
  /** Root-mean-square error of the residuals (same units as y). */
  readonly rmse: number;
  /** Number of observations. */
  readonly n: number;
  /** Number of predictors (excluding the intercept). */
  readonly p: number;
}

/**
 * Solve the square linear system `A x = b` by Gauss–Jordan elimination with
 * partial pivoting. `A` is `n×n`; returns the `n`-vector `x`. Throws if the
 * matrix is singular (e.g. two perfectly collinear predictors).
 */
export function solve(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  // Work on an augmented copy [A | b] so the inputs stay immutable.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot: swap in the row with the largest magnitude in this column.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const diag = M[col][col];
    if (Math.abs(diag) < 1e-12) {
      throw new Error("singular matrix: predictors are collinear");
    }
    // Eliminate this column from every other row.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  // After full elimination M is diagonal: xᵢ = M[i][n] / M[i][i].
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Fit `y ≈ β₀ + β₁·x₁ + … + βₚ·xₚ` by OLS.
 *
 * @param X     One row of raw predictor values per observation (no intercept
 *              column — it is added internally).
 * @param y     Response, one value per observation.
 * @param terms Human-readable predictor names, length p, aligned to X columns.
 */
export function fitOLS(
  X: readonly (readonly number[])[],
  y: readonly number[],
  terms: readonly string[],
): Regression {
  const n = X.length;
  if (n === 0) throw new Error("fitOLS: no observations");
  if (n !== y.length) throw new Error("fitOLS: X and y length mismatch");
  const p = terms.length;
  if (X.some((row) => row.length !== p)) {
    throw new Error("fitOLS: every X row must have one value per term");
  }

  // Mean-center each predictor for conditioning (see the module note). Slopes
  // are invariant to this shift; we restore the raw intercept afterwards.
  const means = terms.map((_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const Xc = X.map((row) => row.map((v, j) => v - means[j]));

  // Design matrix with a leading intercept column of 1s, over centered X.
  const D = Xc.map((row) => [1, ...row]);
  const k = p + 1; // parameters incl. intercept

  // Normal equations: XᵀX (k×k) and Xᵀy (k).
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += D[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += D[i][a] * D[i][b];
    }
  }

  const solved = solve(XtX, Xty);
  // Convert the centered intercept back to raw units: β₀ = c₀ − Σ βⱼ·x̄ⱼ.
  const slopes = solved.slice(1);
  const intercept = solved[0] - slopes.reduce((s, bj, j) => s + bj * means[j], 0);
  const coef = [intercept, ...slopes];

  const fitted = D.map((row) => row.reduce((s, xi, a) => s + xi * solved[a], 0));
  const residuals = y.map((yi, i) => yi - fitted[i]);

  const mean = y.reduce((s, v) => s + v, 0) / n;
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssTot = y.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  const rmse = Math.sqrt(ssRes / n);

  return { terms, coef, fitted, residuals, r2, rmse, n, p };
}

/**
 * Predict the response for a single raw predictor vector (length p, no
 * intercept). `ŷ = β₀ + Σ βⱼ·xⱼ`.
 */
export function predict(reg: Regression, x: readonly number[]): number {
  if (x.length !== reg.p) {
    throw new Error(`predict: expected ${reg.p} predictors, got ${x.length}`);
  }
  return reg.coef[0] + x.reduce((s, xi, j) => s + reg.coef[j + 1] * xi, 0);
}
