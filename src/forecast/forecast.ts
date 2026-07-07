/**
 * Scenario-based forecast of future Fidelis RON coupons.
 *
 * The model is a single transparent regression (see `regression.ts`) fitted on
 * the real historical coupon table joined to three macro drivers at issuance:
 *
 *     coupon% ≈ β₀ + β₁·NBR + β₂·CPI + β₃·(EUR/RON) + β₄·tenor
 *
 * Every historical (issuance × maturity) pair is one observation, so the tenor
 * enters as a plain predictor and the fitted model can price any tenor. We then
 * feed it THREE explicit macro assumptions — base / low / high — and read off a
 * coupon *range*, never a single point "prediction". All assumptions and the
 * fitted coefficients are surfaced in the UI so the model stays inspectable.
 *
 * This is an educational illustration of how coupons have co-moved with macro
 * conditions. It is not a market prediction and not investment advice.
 */

import { HISTORY } from "../data/history";
import { LATEST_MACRO, macroById } from "../data/macro";
import { fitOLS, predict, type Regression } from "./regression";

/** Predictor order for a model row and for `predict()` input vectors. */
export const TERMS = ["NBR", "CPI", "EUR/RON", "tenor"] as const;

/** Tenors (years) the forecast prices — the current RON 2/4/6 structure. */
export const FORECAST_TENORS = [2, 4, 6] as const;

/** One training observation: a real coupon at its macro conditions. */
export interface Observation {
  readonly id: string;
  readonly label: string;
  readonly tenor: number;
  readonly nbr: number;
  readonly cpi: number;
  readonly eurRon: number;
  /** The observed coupon (%) — the regression target. */
  readonly coupon: number;
}

/** A macro assumption: one value per driver. */
export interface MacroAssumption {
  readonly nbr: number;
  readonly cpi: number;
  readonly eurRon: number;
}

export type ScenarioKey = "low" | "base" | "high";

/**
 * A transparent scenario: a named macro narrative expressed as explicit shifts
 * away from the base assumption. Shifts are visible in the UI; nothing hidden.
 */
export interface ScenarioDef {
  readonly key: ScenarioKey;
  readonly label: string;
  readonly narrative: string;
  /** Shift in NBR policy rate (pp) vs base. */
  readonly dNbr: number;
  /** Shift in CPI (pp) vs base. */
  readonly dCpi: number;
  /** Shift in EUR/RON (lei) vs base. */
  readonly dEurRon: number;
}

/**
 * The three canonical scenarios, keyed by the *macro environment* they assume —
 * NOT by the coupon they produce. `low` is a dovish / disinflation environment
 * (BNR easing, inflation cooling, firmer leu); `base` holds the latest macro
 * flat; `high` is a hawkish / stress environment (sticky inflation, weaker leu).
 *
 * Deltas are deliberately modest so the model is not asked to extrapolate far
 * beyond the 2024–25 data. Because the fitted coefficients on inflation and the
 * policy rate came out counterintuitively signed in this short, confounded
 * sample (coupons were trimmed through late 2025 even as CPI rose), a dovish
 * environment can imply *higher* model coupons than a hawkish one. We therefore
 * present the min–max range across scenarios, never a directional prediction —
 * and surface the coefficients so the reader can see exactly why.
 */
export const SCENARIOS: readonly ScenarioDef[] = [
  {
    key: "low",
    label: "Macro relaxat",
    narrative:
      "Dezinflație, BNR reia reducerile de dobândă, leul se stabilizează. Mediu monetar mai relaxat.",
    dNbr: -0.25,
    dCpi: -2.0,
    dEurRon: -0.03,
  },
  {
    key: "base",
    label: "Bază (ultimele valori)",
    narrative:
      "Condițiile macro rămân la ultimele valori observate. Nicio ipoteză de schimbare — punct de plecare neutru.",
    dNbr: 0,
    dCpi: 0,
    dEurRon: 0,
  },
  {
    key: "high",
    label: "Macro tensionat",
    narrative:
      "Inflație persistentă, presiune fiscală, leu mai slab. Mediu monetar mai tensionat.",
    dNbr: 0.25,
    dCpi: 2.0,
    dEurRon: 0.08,
  },
];

/** The predicted coupon for one tenor under one scenario. */
export interface TenorCoupon {
  readonly tenor: number;
  readonly coupon: number;
}

/** A fully resolved scenario: its macro assumption plus a coupon per tenor. */
export interface ScenarioForecast {
  readonly key: ScenarioKey;
  readonly label: string;
  readonly narrative: string;
  readonly assumption: MacroAssumption;
  readonly def: ScenarioDef;
  readonly coupons: readonly TenorCoupon[];
}

/**
 * Build the training set: every historical (issuance × RON maturity) coupon
 * joined to that month's macro conditions. Issuances without a macro point are
 * skipped (kept explicit rather than guessed).
 */
export function buildObservations(): Observation[] {
  const obs: Observation[] = [];
  for (const h of HISTORY) {
    const m = macroById[h.id];
    if (!m) continue;
    for (const [matStr, coupon] of Object.entries(h.ron)) {
      obs.push({
        id: h.id,
        label: h.label,
        tenor: Number(matStr),
        nbr: m.nbr,
        cpi: m.cpi,
        eurRon: m.eurRon,
        coupon,
      });
    }
  }
  return obs;
}

/** Fit the coupon regression on the historical + macro join. */
export function fitModel(obs: readonly Observation[] = buildObservations()): Regression {
  const X = obs.map((o) => [o.nbr, o.cpi, o.eurRon, o.tenor]);
  const y = obs.map((o) => o.coupon);
  return fitOLS(X, y, TERMS);
}

/** Min/max observed coupon — the model's support; outside it is extrapolation. */
export function couponRange(
  obs: readonly Observation[] = buildObservations(),
): { min: number; max: number } {
  const cs = obs.map((o) => o.coupon);
  return { min: Math.min(...cs), max: Math.max(...cs) };
}

/** The neutral base assumption: the latest observed macro reading. */
export const defaultBase: MacroAssumption = {
  nbr: LATEST_MACRO.nbr,
  cpi: LATEST_MACRO.cpi,
  eurRon: LATEST_MACRO.eurRon,
};

/** Apply a scenario's shifts to a base assumption. */
export function applyScenario(base: MacroAssumption, def: ScenarioDef): MacroAssumption {
  return {
    nbr: base.nbr + def.dNbr,
    cpi: base.cpi + def.dCpi,
    eurRon: base.eurRon + def.dEurRon,
  };
}

/**
 * Produce the full forecast: for each scenario, the applied macro assumption
 * and the predicted coupon for every forecast tenor. Returned in low → base →
 * high order so the UI can render a clean range.
 */
export function forecast(
  reg: Regression,
  base: MacroAssumption = defaultBase,
): ScenarioForecast[] {
  return SCENARIOS.map((def) => {
    const assumption = applyScenario(base, def);
    const coupons: TenorCoupon[] = FORECAST_TENORS.map((tenor) => ({
      tenor,
      coupon: predict(reg, [assumption.nbr, assumption.cpi, assumption.eurRon, tenor]),
    }));
    return { key: def.key, label: def.label, narrative: def.narrative, assumption, def, coupons };
  });
}

/** The model-implied coupon band for one tenor across all scenarios. */
export interface TenorBand {
  readonly tenor: number;
  readonly min: number;
  readonly max: number;
  /** True if any scenario's coupon falls outside the historical support. */
  readonly extrapolated: boolean;
}

/**
 * Collapse a set of scenario forecasts into a per-tenor min–max band — the
 * headline "range, not a prediction" figure. Flags tenors whose band escapes
 * the historical coupon support.
 */
export function tenorBands(
  forecasts: readonly ScenarioForecast[],
  support: { min: number; max: number } = couponRange(),
): TenorBand[] {
  return FORECAST_TENORS.map((tenor) => {
    const vals = forecasts.map(
      (f) => f.coupons.find((c) => c.tenor === tenor)!.coupon,
    );
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { tenor, min, max, extrapolated: min < support.min || max > support.max };
  });
}
