# Fidelis Backtester

A single-page **historic-yield simulator** for Romania's Fidelis government-bond
program (RON tranches, 2024–2025). Pick an amount, a start date and a strategy
(single issuance or a 3-rung ladder), toggle the blood-donor tranche and
reinvestment, and see what the holding would have been worth by mid-2026 — with
tax-free annual coupons compounded on reinvestment.

> Educational tool. Not investment advice. Historic yields do not guarantee
> future results. Verify the official terms on
> [mfinante.gov.ro](https://mfinante.gov.ro/ro/web/titluridestat/fidelis) before
> subscribing.

## Architecture

Refactored from a single `index.html` into a **Vite + TypeScript** project — no
framework. The layers are strictly separated:

```
src/
  data/history.ts   Typed rate table — one entry per issuance, with source URL.
  data/macro.ts     Macro drivers per issuance month (NBR rate · CPI · EUR/RON).
  sim/              Pure, deterministic simulation core (no DOM).
    history.ts        idToYear · matsAt · couponFor · issuanceAtOrAfter
    simulate.ts       simulateLeg · valueOf · run · summarize (coupon/CAGR math)
    explain.ts        buildExplainPrompt · claudeDeepLink (state → prompt → URL)
    *.test.ts         Vitest unit + golden-regression tests
  forecast/         Pure, transparent forecast core (no DOM).
    regression.ts     Tiny OLS (normal equations + Gauss–Jordan); no black box.
    forecast.ts       Fit coupons on macro + tenor · 3 scenarios · per-tenor bands
    *.test.ts         Vitest unit + golden tests (coefficients, fit, scenarios)
  ui/               Render layer (DOM only; imports sim/forecast, never the reverse).
    format.ts · render.ts · forecast.ts · explain.ts · app.ts · styles.css
  main.ts           Entry point: mounts the app.
```

### Explain my strategy

The results panel has an **"Explică-mi strategia cu Claude ↗"** button that
serializes the live portfolio state + simulated results into a compact prompt
and deep-links to a fresh [claude.ai](https://claude.ai) conversation with it
prefilled (`https://claude.ai/new?q=<prompt>`) — **no API key, no backend**, the
prompt travels in the URL. It is a real `target="_blank" rel="noopener"` anchor
whose `href` is refreshed from state at click time, so it is not caught by popup
blockers. A **"Copiază promptul"** button is the copy-to-clipboard fallback
(async Clipboard API with a hidden-textarea `execCommand` fallback). The prompt
builder (`sim/explain.ts`) is pure and unit-tested; it carries the same
educational, not-investment-advice boundary into the conversation.

The `sim/` core is pure and side-effect-free, so the math is unit-testable in
isolation and the UI is a thin projection of it.

## Scenario forecast module

A second, **experimental** module illustrates how Fidelis RON coupons have
co-moved with the macro backdrop — and deliberately stops short of predicting
them. It is **educational, not investment advice**: nobody can know future
coupons (the Ministry of Finance sets them per issuance), and the copy makes
that boundary prominent.

- **Model.** One transparent ordinary-least-squares regression (`forecast/
  regression.ts` — normal equations solved by Gauss–Jordan, a few dozen lines,
  no dependencies, no black box) fitted on every historical `(issuance ×
  maturity)` coupon joined to that month's macro drivers:

  ```
  coupon% ≈ β₀ + β₁·NBR + β₂·CPI + β₃·(EUR/RON) + β₄·tenor
  ```

  Predictors are mean-centered only for numerical stability (two drivers barely
  move in-sample); coefficients are converted back to raw units, so every β
  reads in the predictor's own units. The UI shows the fitted formula, R², RMSE,
  the coefficient table with plain-language interpretations, and the historical
  coupon support.
- **Three scenarios, never a point prediction.** `base` holds the latest macro
  flat; `low` / `high` apply small, fully-visible shifts (a dovier vs. a more
  stressed macro environment). The headline is the **min–max range per tenor**,
  with an explicit *extrapolation* flag when a band escapes the historical
  coupon support.
- **Honest about its limits.** On this short 2024–25 sample the inflation and
  policy-rate coefficients come out counterintuitively signed (coupons were
  trimmed through late 2025 even as CPI rose). Rather than hide that, the module
  surfaces it — which is exactly why it shows a scenario *range* instead of a
  single number. The macro series (`data/macro.ts`) are approximate, clearly
  labelled, and pinned to public BNR/INS sources for verification.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # run the Vitest suite
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
```

## Tests

Written **before** the refactor and kept green through it:

- `sim/simulate.test.ts` — hand-verified unit tests for the coupon and CAGR math
  (rate lookup, maturity fallback across the 1/3/5 → 2/4/6 switch, reinvestment
  compounding, valuation, annualized return).
- `sim/golden.test.ts` — a regression guard that replays the **original**
  single-file app's outputs across the full scenario matrix (every start date ×
  strategy × donor × reinvest, plus detailed leg dumps) captured in
  `sim/__fixtures__/golden.json`. If an observed output changes, this fails.
- `forecast/regression.test.ts` — the OLS core: exact recovery of a known linear
  relation (R² = 1), classic slope/intercept, pivoting, singular-matrix guard.
- `forecast/forecast.test.ts` — the coupon model: the macro join, golden fitted
  coefficients and fit stats, term-premium monotonicity, scenario shifts, and
  the per-tenor extrapolation flag.

## Deployment (GitHub Pages)

`npm run build` emits a static site to `dist/` with a relative base path, so it
works from any Pages URL. The workflow in `.github/workflows/deploy.yml` builds,
tests, and deploys on every push to `main` — enable Pages with
**Settings → Pages → Source: GitHub Actions**.

## Data & method

Rates are annual fixed coupons from Ministry of Finance communiqués for each
Fidelis issuance (see `src/data/history.ts`). Interest and capital gains are
tax-free (and CASS-exempt). Mid-2025 the 1/3/5-year RON tranches were replaced
by 2/4/6-year ones. Months without an issuance reuse the last available rate.
The model assumes a fixed coupon paid annually and holding to maturity — it does
not model early sale on the exchange at market price.
