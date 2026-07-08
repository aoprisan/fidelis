# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + TypeScript single-page app with no framework and zero runtime JS dependencies. Source lives under `src/`: `data/` contains typed Fidelis rates and benchmarks, `sim/` contains pure deterministic simulation logic, `scenario/` handles share-link and saved-scenario state, and `ui/` is the DOM/SVG/canvas layer. `src/main.ts` wires the app together. Tests sit next to implementation files as `*.test.ts`; golden regression data is in `src/sim/__fixtures__/golden.json`. Static entry files are `index.html`, `vite.config.ts`, and `src/ui/styles.css`.

## Build, Test, and Development Commands

- `npm install`: install development dependencies.
- `npm run dev`: start the local Vite dev server.
- `npm test`: run the full Vitest suite once.
- `npm run test:watch`: run Vitest in watch mode.
- `npx vitest run src/sim/simulate.test.ts`: run one test file.
- `npm run typecheck`: run `tsc --noEmit`.
- `npm run build`: type-check and build the static site into `dist/`.
- `npm run preview`: serve the production build locally.

## Coding Style & Naming Conventions

Use TypeScript ES modules and keep imports one-directional: `ui/` may import `sim/` and `scenario/`, but pure core modules must not import DOM code. The compiler is strict: unused locals/parameters, missing returns, and switch fallthrough fail type-checking. Follow existing two-space indentation, double quotes, semicolons, camelCase functions/variables, PascalCase classes/types, and uppercase constants such as `END`.

## Testing Guidelines

Use Vitest `describe`/`it` tests colocated with the module under test. Pure simulation and scenario behavior should be tested without DOM dependencies. `src/sim/golden.test.ts` guards expected simulation output; if math or rate tables intentionally change, regenerate `golden.json` deliberately and explain the behavioral change in the PR. Run `npm test` and `npm run build` before handing off substantive changes.

## Commit & Pull Request Guidelines

Recent commits use short imperative subject lines, for example `Add top-level Plan / Info / Avansat tabs` or `Show EUR blood-donor tranche bars in the Info cards`. Keep commits focused and describe user-visible or domain-math changes clearly. Pull requests should include a concise summary, tests run, linked issue if applicable, and screenshots or recordings for UI changes.

## Agent-Specific Instructions

Read `CLAUDE.md` before touching simulation, planner, rate, benchmark, or export code. Preserve the zero-runtime-dependency constraint and the Romanian UI unless the task explicitly says otherwise.
