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
  sim/              Pure, deterministic simulation core (no DOM).
    history.ts        idToYear · matsAt · couponFor · issuanceAtOrAfter
    simulate.ts       simulateLeg · valueOf · run · summarize (coupon/CAGR math)
    *.test.ts         Vitest unit + golden-regression tests
  ui/               Render layer (DOM only; imports sim, never the reverse).
    format.ts · render.ts · app.ts · styles.css
  main.ts           Entry point: mounts the app.
```

The `sim/` core is pure and side-effect-free, so the math is unit-testable in
isolation and the UI is a thin projection of it.

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
