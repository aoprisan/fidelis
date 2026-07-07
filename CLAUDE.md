# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page, framework-free historic-yield simulator for Romania's Fidelis
government-bond program (RON tranches, 2024–2025). Vite + TypeScript, deployed as
a static site to GitHub Pages. Refactored from an original single `index.html`.

## Commands

```bash
npm run dev        # Vite dev server
npm test           # Vitest suite (run once)
npm run test:watch # Vitest in watch mode
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
npm run preview    # serve the built dist/
```

Run a single test file / test:

```bash
npx vitest run src/sim/simulate.test.ts
npx vitest run -t "reinvestment"     # filter by test name
```

## Architecture: strict one-way layering

The dependency direction is enforced by convention and must be preserved:

```
data/  →  sim/  →  ui/  →  main.ts
```

- **`src/data/history.ts`** — the single source of truth: a typed, `readonly`
  table of real MF issuances (`HISTORY`), plus the simulation horizon constant
  `END` (mid-2026 as a decimal year). No logic. Adding/correcting a rate happens
  here and nowhere else.
- **`src/sim/`** — the pure, deterministic, DOM-free core. `history.ts` does
  lookups/coupon resolution; `simulate.ts` does the coupon/CAGR math. Import
  everything via the `sim/index.ts` barrel. **This layer must never import from
  `ui/` or touch the DOM** — that purity is what makes the golden tests possible.
- **`src/ui/`** — DOM-only render layer. Imports `sim` and `data`, never the
  reverse. `app.ts` wires controls to a single mutable `SimParams` state object
  and re-renders on every change (`app → render → format`). `index.html` at the
  repo root holds the static markup; `ui/` fills the `#headline`, `#viz`,
  `#detail` slots by id.
- **`src/main.ts`** — entry point, mounts the app; loaded by `index.html`.

## Domain model (read before touching sim math)

- Time is **decimal years** (`idToYear("2025-02")` → `2025 + 1/12`). Issuance ids
  are `YYYY-MM` strings, and their lexical order matches chronological order —
  code relies on this (e.g. `HISTORY.filter(h => h.id >= "2024-10")`).
- A **Leg** is one holding period: principal held to maturity paying an annual
  tax-free coupon. `simulateLeg` is a bounded reducer (max 12 rollovers) that
  chains legs when `reinvest` is on — at maturity, principal + all coupons
  compound into the next issuance at/after that year.
- **Two strategies**: `single` (whole amount, one leg chain) and `ladder` (split
  in 3 across shortest/mid/longest maturities at the start issuance).
- **Maturity fallback matters**: mid-2025 the 1/3/5-year tranches were replaced
  by 2/4/6-year ones. `couponFor` maps a requested maturity to the nearest
  available one, so simulations spanning that switch stay valid. The blood-donor
  tranche, when present, always maps to the 2-year rate.
- `summarize()` is the headline entry point → `{ finalValue, profit, years, cagr }`.

## Tests are a behavioral contract, not scaffolding

- `sim/simulate.test.ts` — hand-verified unit tests of the coupon/CAGR math.
- `sim/golden.test.ts` — a regression guard that replays the **original
  single-file app's** outputs across the entire scenario matrix (every start
  date × strategy × donor × reinvest), captured in `sim/__fixtures__/golden.json`.

Any change to `sim/` that alters an output will fail the golden test. If a change
is intentional (e.g. a corrected rate, a deliberate math fix), regenerate/update
`golden.json` **deliberately** and call it out — do not silently overwrite it to
make the suite pass. CI runs `npm test` before every deploy.

## Deployment

`vite.config.ts` sets `base: "./"` (relative) so the build works from any Pages
URL. `.github/workflows/deploy.yml` runs test → build → deploy on push to `main`.
