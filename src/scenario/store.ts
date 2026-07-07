import type { SimParams } from "../sim/simulate";
import { sanitizeParams } from "./codec";

/**
 * Persistence for named investment scenarios. The list operations are pure
 * (and unit-tested); `ScenarioStore` is a thin wrapper that reads/writes them
 * through a `StorageLike` (defaulting to `localStorage` in the browser).
 */

/** A saved, named investment scenario. */
export interface Scenario {
  /** Stable unique id. */
  id: string;
  /** User-chosen display name. */
  name: string;
  /** The simulation parameters this scenario captures. */
  params: SimParams;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
  /** Last-modified timestamp (ms since epoch). */
  updatedAt: number;
}

/** The subset of the Web Storage API we depend on (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage key; versioned so the shape can evolve without clobbering. */
export const STORAGE_KEY = "fidelis.scenarios.v1";

/** Coerce untrusted input into a valid `Scenario`, or drop it. */
function sanitizeScenario(raw: unknown): Scenario | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const params = sanitizeParams(r.params);
  if (!params) return null;
  const id = typeof r.id === "string" && r.id ? r.id : null;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!id || !name) return null;
  const createdAt = Number.isFinite(r.createdAt) ? (r.createdAt as number) : 0;
  const updatedAt = Number.isFinite(r.updatedAt) ? (r.updatedAt as number) : createdAt;
  return { id, name, params, createdAt, updatedAt };
}

/** Parse (and validate) a stored JSON blob into a scenario list. */
export function parseScenarios(json: string | null): Scenario[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.map(sanitizeScenario).filter((s): s is Scenario => s !== null);
}

/** Serialize a scenario list for storage. */
export function serializeScenarios(list: Scenario[]): string {
  return JSON.stringify(list);
}

/** Insert or replace a scenario by id, returning a new list (pure). */
export function upsertScenario(list: Scenario[], s: Scenario): Scenario[] {
  const i = list.findIndex((x) => x.id === s.id);
  if (i === -1) return [...list, s];
  const next = list.slice();
  next[i] = s;
  return next;
}

/** Remove a scenario by id, returning a new list (pure). */
export function removeScenario(list: Scenario[], id: string): Scenario[] {
  return list.filter((x) => x.id !== id);
}

/** Rename a scenario by id, bumping `updatedAt`, returning a new list (pure). */
export function renameScenario(
  list: Scenario[],
  id: string,
  name: string,
  now: number,
): Scenario[] {
  const trimmed = name.trim();
  if (!trimmed) return list;
  return list.map((x) => (x.id === id ? { ...x, name: trimmed, updatedAt: now } : x));
}

/** localStorage-backed CRUD over the scenario list. */
export class ScenarioStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly key: string = STORAGE_KEY,
  ) {}

  all(): Scenario[] {
    return parseScenarios(this.storage.getItem(this.key));
  }

  private write(list: Scenario[]): Scenario[] {
    this.storage.setItem(this.key, serializeScenarios(list));
    return list;
  }

  save(s: Scenario): Scenario[] {
    return this.write(upsertScenario(this.all(), s));
  }

  remove(id: string): Scenario[] {
    return this.write(removeScenario(this.all(), id));
  }

  rename(id: string, name: string, now: number): Scenario[] {
    return this.write(renameScenario(this.all(), id, name, now));
  }
}
