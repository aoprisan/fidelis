# Fidelis — cât câștigi împrumutând statul?

A single-page **yield simulator** for Romania's Fidelis government-bond program
(**RON + EUR** tranches, 2024–2026): tax-free annual coupons, zero fees, and a
special higher-rate tranche for blood donors. Three tabs, one certificate-styled
sheet:

- **Plan** — the newcomer-friendly earnings model: pick an amount and a tranche
  from the current (or any past) edition and see exactly what the state pays
  you, year by year, to maturity or marked to today. Opens with a "Fidelis in 30
  seconds" fact strip and a plain-language explainer for first-time buyers.
- **Info** — the full rate history of every issuance.
- **Avansat** — the historic backtester: lump-sum or recurring contributions,
  single issuance or a 3-rung ladder, donor tranche, reinvestment compounding, a
  taxed-deposit + inflation benchmark, saved/compared/shared scenarios, PNG/PDF
  export.

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
  scenario/         Pure scenario layer (no DOM).
    codec.ts          encode/decode/sanitize params for share links & storage
    store.ts          named-scenario CRUD over a StorageLike (localStorage)
    compare.ts        build/index/bound value curves for multi-scenario comparison
    *.test.ts         Vitest unit tests
  ui/               Render layer (DOM only; imports sim/scenario, never the reverse).
    format.ts · render.ts · app.ts · styles.css
    render.ts         headline stats · value-over-time growth chart (SVG) · timeline · detail table
    scenarios.ts      save / edit / rename / delete panel
    compare.ts        "Compară scenarii" view — overlaid curves + side-by-side table
    export.ts         canvas "report card" → PNG / PDF / Web Share
    pdf.ts            tiny dependency-free PDF writer (+ pdf.test.ts)
  main.ts           Entry point: mounts the app, wires the share-link hash.
```

The `sim/` and `scenario/` cores are pure and side-effect-free, so the math and
serialization are unit-testable in isolation and the UI is a thin projection of
them.

## Scenario graphics

Each scenario is drawn three ways, all from the same pure simulation core:

- **Growth chart** — a value-over-time curve (`trajectory()` in `sim/simulate.ts`,
  rendered as a dependency-free inline SVG) showing the holding climb from the
  invested amount to today's value, with a dashed "invested" baseline. For a
  ladder it sums the value across all rungs. The same curve is painted onto the
  PNG / PDF export so the report card matches the page.
- **Timeline** — a Gantt-style lane per issuance/maturity (`vizHTML`).
- **Detail table** — per-tranche coupon, principal and status.

## Contribution schedule: lump sum or recurring

The **Contribuție** control switches between two ways of putting money in, both
running through the same pure core (`contributionMonths` · `run` in
`sim/simulate.ts`):

- **O singură dată** — the classic lump sum: the whole amount is invested at one
  start date.
- **Lunar (recurent)** — the *same amount* is invested in each of several chosen
  issuance months. Tap the months in the grid to build the plan; **Toate**
  selects the whole series (a continuous, month-after-month plan) and **Golește**
  collapses back to a single month. Each contribution is run through the current
  strategy/maturity/donor/reinvest settings, and the capital blocks are summed.

Because a recurring plan's money is deployed on different dates, a plain
`(final / invested)` CAGR would overstate the return. The headline **annualized
return** for a recurring plan is instead the **money-weighted return** (IRR,
`irr()` in `sim/simulate.ts`) of the contribution cash flows against the final
value; a single-month plan reduces exactly to the lump-sum CAGR. The value curve
and the invested baseline reflect the full committed capital
(`amount × months`).

Recurring plans are shared and stored just like lump sums: the plan months ride
along in the URL hash (`#s?…&p=2025-02,2025-03,…`) and in saved scenarios.

## Compare scenarios

The **Compară scenarii** view overlays the value curves of the current
scenario and any saved ones on a single chart, with a side-by-side table of
amount, start, strategy, final value, profit and annualized return (the best
return is flagged). Pick which scenarios to include with the chips; the chart
updates live as you change the controls. Toggle between:

- **RON** — absolute value curves.
- **Index 100** — every curve rebased to `100` at its start (dashed reference
  line), so scenarios of different sizes compare on the same performance scale.

The comparison maths (`buildComparison` · `indexPoints` · `boundsOf` ·
`bestByCagr`) lives in the pure `scenario/compare.ts`; `ui/compare.ts` is only
the DOM/SVG projection.

## Scenarios: save, edit, export & share

- **Save / edit** — name the current parameters and store them (in
  `localStorage`). Saved scenarios can be loaded back, updated in place, renamed,
  or deleted. `scenario/store.ts` keeps the list operations pure; the panel in
  `ui/scenarios.ts` is only DOM glue.
- **Share link** — the live parameters are mirrored into the URL hash
  (`#s?a=…&s=…`), so copying the address (or the **Copiază link** button) shares
  an exact scenario; opening such a link restores it.
- **Export PNG / PDF** — the results are painted onto a `<canvas>` "report card"
  matching the on-page design, then saved as a PNG or wrapped into a one-page PDF.
  Both are built from scratch — the PDF writer (`ui/pdf.ts`) embeds a JPEG via
  `/DCTDecode` — so the app keeps **zero runtime dependencies**.
- **Share** — on browsers that support it, the **Partajează** button hands the
  PNG to the native Web Share API (files); otherwise it falls back to a download.

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
