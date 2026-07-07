import {
  run,
  summarize,
  trajectory,
  type SimParams,
  type Summary,
  type ValuePoint,
} from "../sim/simulate";

/**
 * Pure comparison layer (no DOM): turn a set of named scenarios into the
 * headline figures and value-over-time curves needed to plot them together.
 * Kept side-effect-free so the maths and normalization are unit-testable.
 */

/** One scenario to compare: a stable key, a display name and its params. */
export interface CompareInput {
  id: string;
  name: string;
  params: SimParams;
}

/** A scenario resolved into its summary and its value curve. */
export interface CompareSeries {
  id: string;
  name: string;
  params: SimParams;
  summary: Summary;
  points: ValuePoint[];
}

/** Run each scenario and collect its summary + value trajectory. */
export function buildComparison(inputs: CompareInput[]): CompareSeries[] {
  return inputs.map((i) => ({
    id: i.id,
    name: i.name,
    params: i.params,
    summary: summarize(i.params),
    points: trajectory(run(i.params)),
  }));
}

/**
 * Re-express a value curve as an index with its starting value = 100, so
 * scenarios of different sizes can be compared on the same performance scale.
 */
export function indexPoints(points: ValuePoint[]): ValuePoint[] {
  if (points.length === 0) return [];
  const base = points[0].value || 1;
  return points.map((p) => ({ t: p.t, value: (p.value / base) * 100 }));
}

/** The value curve for a series, absolute or indexed to 100. */
export function seriesCurve(s: CompareSeries, normalized: boolean): ValuePoint[] {
  return normalized ? indexPoints(s.points) : s.points;
}

/** Rectangular bounds covering a set of (already-scaled) curves. */
export interface Bounds {
  minT: number;
  maxT: number;
  minV: number;
  maxV: number;
}

/** Tight bounds over every point of every curve (empty curves ignored). */
export function boundsOf(curves: ValuePoint[][]): Bounds | null {
  const pts = curves.flat();
  if (pts.length === 0) return null;
  let minT = Infinity;
  let maxT = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of pts) {
    if (p.t < minT) minT = p.t;
    if (p.t > maxT) maxT = p.t;
    if (p.value < minV) minV = p.value;
    if (p.value > maxV) maxV = p.value;
  }
  return { minT, maxT, minV, maxV };
}

/** Index of the series with the highest annualized return (or -1 if none). */
export function bestByCagr(series: CompareSeries[]): number {
  let best = -1;
  let top = -Infinity;
  series.forEach((s, i) => {
    if (s.summary.cagr > top) {
      top = s.summary.cagr;
      best = i;
    }
  });
  return best;
}
