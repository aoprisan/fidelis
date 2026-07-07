# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page **historic-yield simulator** for Romania's Fidelis government-bond
program (**RON + EUR** tranches, **2024–2026**). Vite + TypeScript, **no
framework, zero runtime JS dependencies**. Builds to a static site deployed to
GitHub Pages. The UI is in Romanian.

The visual identity is a **security-printed government-bond certificate** —
banknote-paper ground, intaglio ink, treasury green + seal oxblood, Fraunces +
Inter type, and a detachable interest-coupon strip as the signature element (see
`src/ui/styles.css`). The only non-self-contained asset is the Google Fonts
`<link>` in `index.html`; everything else is inlined.

## Commands

```bash
npm install
npm run dev              # local dev server
npm test                 # run the full Vitest suite once
npm run test:watch       # Vitest in watch mode
npx vitest run src/sim/simulate.test.ts   # run a single test file
npx vitest run -t "reinvest"              # run tests matching a name
npm run typecheck        # tsc --noEmit
npm run build            # typecheck + production build to dist/
npm run preview          # serve the production build
```

`npm run build` runs `tsc --noEmit` first, and `tsconfig.json` enables `strict`,
`noUnusedLocals`, and `noUnusedParameters` — dead locals/params fail the build,
not just lint.

## Architecture: strict one-directional layering

The core invariant — **`ui/` imports `sim/` and `scenario/`, never the reverse.**
The two cores are pure and side-effect-free so the math and serialization are
unit-testable without a DOM; the UI is a thin projection of them.

- **`src/data/history.ts`** — the typed rate table (one entry per issuance, with
  source URL). The single source of truth for coupons; edits to Fidelis rates go
  here.
- **`src/data/benchmarks.ts`** — monthly macro benchmarks (avg RON term-deposit
  rate, CPI index base Aug 2024 = 100) with BNR/INS source URLs. Values are
  flagged approximations — verify against the official series before changing.
- **`src/sim/`** — pure deterministic simulation (no DOM). `history.ts`
  (rate/maturity lookup), `simulate.ts` (coupon/CAGR/IRR math, `run`,
  `trajectory`, `summarize`), `benchmark.ts` (taxed-deposit alternative on the
  same contribution schedule, CPI deflation, `benchmarkSummary`), `cashflow.ts`
  (coupon/principal payment calendar derived from legs), `index.ts` re-exports
  all of them.
- **`src/scenario/`** — pure scenario layer (no DOM). `codec.ts`
  (encode/decode/sanitize params for share links + storage), `store.ts`
  (named-scenario CRUD over a `StorageLike`), `compare.ts` (multi-scenario value
  curves).
- **`src/ui/`** — DOM/SVG/canvas render layer only. `app.ts` (state + subscribe),
  `render.ts`, `benchmark.ts` (Fidelis vs deposit vs inflation section),
  `hook.ts` (masthead latest-rates callout), `scenarios.ts`, `compare.ts`,
  `export.ts`, `pdf.ts`, `format.ts`, `styles.css`.
- **`src/main.ts`** — entry point: mounts the app, mirrors live params into the
  URL hash (`#s?...`), wires the one shared `ScenarioStore` so the save panel and
  compare view stay in sync.

## Domain rules that constrain the math

- **Two contribution modes, one core.** Lump sum vs. recurring monthly both run
  through `run`/`contributionMonths` in `sim/simulate.ts`. For recurring plans the
  headline annualized return is the **money-weighted IRR** (`irr()`), *not*
  `final/invested` CAGR (which would overstate it); a single-month plan reduces
  exactly to the lump-sum CAGR. Preserve this distinction when touching return math.
- **Currency.** `SimParams.currency` (`RON`|`EUR`) selects the tranche table
  (`h.maturities` vs `h.eur`) via `couponFor`/`matsAt`. Donor tranches are
  RON-only (forced off in EUR), and the deposit/inflation benchmark is RON-only
  (BNR/INS series), so `render.ts` and `export.ts` omit it for EUR.
- **Maturity switch.** Mid-2025 the 1/3/5-year RON tranches were replaced by
  2/4/6-year ones; rate/maturity lookup handles this fallback. Months without an
  issuance reuse the last available rate.
- **Horizon.** The backtester is **END-anchored** (`END`, mid-2026 in
  `data/history.ts`): legs accrue/mature relative to that fixed horizon, which is
  what `trajectory`, `benchmark`, and `cashflow` assume. Do not switch to a
  hold-to-maturity model without reworking those.
- Coupons are annual, fixed, tax-free (CASS-exempt), held to maturity — no
  early-sale-at-market modeling.

## Tests: golden regression guard

`src/sim/golden.test.ts` locks in the current sim output across the full scenario
matrix (every start × strategy × donor × reinvest × **currency**, plus leg dumps)
from `src/sim/__fixtures__/golden.json`. **Any change to simulation output fails
this test.** If you intentionally change the math or the rate table, the fixture
must be regenerated deliberately and the change justified — do not blindly update
it to make the suite pass. `pdf.ts` and each pure module carry their own
`*.test.ts`; when rates change, the hand-verified numbers in `simulate.test.ts` /
`cashflow.test.ts` / `compare.test.ts` need updating alongside.

## Deployment

`.github/workflows/deploy.yml` runs `npm ci && npm test && npm run build` and
deploys `dist/` to GitHub Pages on every push to `main`. Vite `base: "./"` keeps
the built site working from any Pages path. Zero runtime deps is a deliberate
constraint (the PDF writer in `ui/pdf.ts` is hand-rolled) — keep it that way.
