import { FIRST_SELECTABLE } from "../data/history";
import { byId, matsAt } from "../sim/history";
import type { SimParams, Strategy } from "../sim/simulate";

/**
 * (De)serialization of a scenario's simulation parameters for share links and
 * for validating anything read back from storage or a URL. Everything here is
 * pure and side-effect-free so it can be unit-tested in isolation.
 */

const STRATEGIES: readonly Strategy[] = ["single", "ladder"];

/** Pick a valid maturity for a start issuance, snapping to the default (5y). */
function resolveMat(startId: string, raw: unknown): number {
  const mats = matsAt(startId);
  const m = Number(raw);
  if (mats.includes(m)) return m;
  return mats.includes(5) ? 5 : mats[mats.length - 1];
}

/**
 * Coerce arbitrary (untrusted) input into valid `SimParams`, or return `null`
 * when it cannot be salvaged. The start issuance must exist in the rate table
 * and be selectable; the maturity snaps to the nearest valid one; amount must
 * be a finite non-negative number.
 */
export function sanitizeParams(raw: unknown): SimParams | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const startId = String(r.startId ?? "");
  if (!byId[startId] || startId < FIRST_SELECTABLE) return null;

  const strat = r.strat as Strategy;
  if (!STRATEGIES.includes(strat)) return null;

  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return {
    amount,
    startId,
    strat,
    mat: resolveMat(startId, r.mat),
    donor: !!r.donor,
    reinvest: !!r.reinvest,
  };
}

/** Encode params to a compact, URL-safe query string (no leading `?`). */
export function encodeParams(p: SimParams): string {
  return new URLSearchParams({
    a: String(p.amount),
    s: p.startId,
    t: p.strat,
    m: String(p.mat),
    d: p.donor ? "1" : "0",
    r: p.reinvest ? "1" : "0",
  }).toString();
}

/** Decode a query string (with or without leading `?`) back into params. */
export function decodeParams(query: string): SimParams | null {
  const q = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  return sanitizeParams({
    amount: q.get("a"),
    startId: q.get("s"),
    strat: q.get("t"),
    mat: q.get("m"),
    donor: q.get("d") === "1",
    reinvest: q.get("r") === "1",
  });
}
