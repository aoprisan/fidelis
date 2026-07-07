import { describe, expect, it } from "vitest";
import type { SimParams } from "../sim/simulate";
import {
  parseScenarios,
  removeScenario,
  renameScenario,
  ScenarioStore,
  serializeScenarios,
  upsertScenario,
  type Scenario,
  type StorageLike,
} from "./store";

const params: SimParams = {
  amount: 50000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
};

const make = (id: string, name: string, t = 1000): Scenario => ({
  id,
  name,
  params,
  createdAt: t,
  updatedAt: t,
});

/** In-memory StorageLike for tests. */
function memStorage(): StorageLike & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    dump: () => Object.fromEntries(m),
  };
}

describe("pure list ops", () => {
  it("upsert inserts when the id is new", () => {
    const list = upsertScenario([], make("a", "A"));
    expect(list).toHaveLength(1);
  });

  it("upsert replaces when the id exists (no duplicate)", () => {
    const list = upsertScenario([make("a", "A")], make("a", "A2", 2000));
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("A2");
  });

  it("remove drops by id", () => {
    expect(removeScenario([make("a", "A"), make("b", "B")], "a")).toHaveLength(1);
  });

  it("rename updates name and updatedAt, ignoring blanks", () => {
    const renamed = renameScenario([make("a", "A")], "a", "  New  ", 9999);
    expect(renamed[0].name).toBe("New");
    expect(renamed[0].updatedAt).toBe(9999);
    const unchanged = renameScenario([make("a", "A")], "a", "   ", 9999);
    expect(unchanged[0].name).toBe("A");
  });
});

describe("parse / serialize", () => {
  it("round-trips a list", () => {
    const list = [make("a", "A"), make("b", "B")];
    expect(parseScenarios(serializeScenarios(list))).toEqual(list);
  });

  it("returns [] for null, bad JSON, or a non-array", () => {
    expect(parseScenarios(null)).toEqual([]);
    expect(parseScenarios("{not json")).toEqual([]);
    expect(parseScenarios('{"a":1}')).toEqual([]);
  });

  it("drops entries with invalid params or missing name/id", () => {
    const raw = JSON.stringify([
      make("a", "A"),
      { id: "b", name: "B", params: { ...params, startId: "1999-01" } },
      { id: "", name: "C", params },
      { id: "d", name: "", params },
    ]);
    const parsed = parseScenarios(raw);
    expect(parsed.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("ScenarioStore", () => {
  it("saves, reads, renames and removes through storage", () => {
    const storage = memStorage();
    const store = new ScenarioStore(storage);

    store.save(make("a", "A"));
    store.save(make("b", "B"));
    expect(store.all()).toHaveLength(2);

    store.rename("a", "Alpha", 5000);
    expect(store.all().find((s) => s.id === "a")?.name).toBe("Alpha");

    store.remove("b");
    expect(store.all().map((s) => s.id)).toEqual(["a"]);

    // persisted, not just in-memory in the instance
    expect(new ScenarioStore(storage).all()).toHaveLength(1);
  });

  it("save with an existing id updates in place", () => {
    const store = new ScenarioStore(memStorage());
    store.save(make("a", "A", 1000));
    store.save(make("a", "A-edited", 2000));
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].name).toBe("A-edited");
  });
});
