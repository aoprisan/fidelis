import { FIRST_SELECTABLE, HISTORY } from "../data/history";
import { byId, matsAt } from "../sim/history";
import type { PlanParams, Risk } from "../sim/planner";
import type { Horizon, SimParams } from "../sim/simulate";
import { fmt } from "./format";
import { render, renderPlan, type RenderTargets } from "./render";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

/** Toggle `aria-pressed` across a segmented button group. */
const press = (buttons: Iterable<Element>, active: Element): void => {
  for (const b of buttons) b.setAttribute("aria-pressed", String(b === active));
};

/** Issuances offered as start / contribution months. */
const SELECTABLE = HISTORY.filter((h) => h.id >= FIRST_SELECTABLE);

/** The denomination word shown on amount labels for a currency. */
const ccyWord = (ccy: string): string => (ccy === "EUR" ? "euro" : "lei");

type Mode = "backtest" | "plan";

/** The default scenario shown on first load. */
export const DEFAULT_PARAMS: SimParams = {
  amount: 50000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
  currency: "RON",
  horizon: "now",
};

/**
 * Imperative handle onto the running app: read the current parameters, replace
 * them wholesale (used when loading a saved or shared scenario), and subscribe
 * to changes (used to keep the share link and exports in sync).
 */
export interface AppController {
  getParams(): SimParams;
  setParams(p: SimParams): void;
  subscribe(cb: (p: SimParams) => void): void;
}

/**
 * Wire the controls to the render layer over a single mutable state object,
 * mirroring the original single-file app's interaction model, and expose a
 * controller so other UI modules (scenarios, export) can drive it. Two modes —
 * the historic backtester and the forward ladder planner — share the start-date
 * and currency selectors; switching mode swaps which state object is painted.
 */
export function createApp(initial?: SimParams | null): AppController {
  let mode: Mode = "backtest";

  const S: SimParams = { ...DEFAULT_PARAMS, ...(initial ?? {}) };

  const P: PlanParams = {
    monthly: 1000,
    horizonYears: 3,
    startId: S.startId,
    risk: "balanced",
    donorEligible: false,
    reinvest: true,
    currency: S.currency,
  };

  const targets: RenderTargets = {
    headline: el("headline"),
    chart: el("chart"),
    bench: el("bench"),
    viz: el("viz"),
    detail: el("detail"),
    calendar: el("calendar"),
  };

  const subscribers: Array<(p: SimParams) => void> = [];
  const paint = () => {
    if (mode === "plan") renderPlan(P, targets);
    else render(S, targets);
    const snapshot = { ...S, ...(S.plan ? { plan: [...S.plan] } : {}) };
    subscribers.forEach((cb) => cb(snapshot));
  };

  /** A recurring plan is active when it holds at least one contribution month. */
  const isRecurring = () => !!(S.plan && S.plan.length > 0);

  // --- mode (backtester vs planner) -----------------------------------------

  function bindMode() {
    const seg = el("modeSeg");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        mode = (b as HTMLButtonElement).dataset.mode as Mode;
        press(seg.children, b);
        applyMode();
        paint();
      };
    });
  }

  /** Show the controls + result affordances that belong to the active mode. */
  function applyMode() {
    const planMode = mode === "plan";
    el("backtestControls").style.display = planMode ? "none" : "block";
    el("planControls").hidden = !planMode;
    const scenarios = document.querySelector<HTMLElement>(".scenarios");
    if (scenarios) scenarios.style.display = planMode ? "none" : "block";
    el("actions").style.display = planMode ? "none" : "flex";
    const compare = document.getElementById("compare");
    if (compare) compare.style.display = planMode ? "none" : "block";
    if (planMode) {
      el("startWrap").hidden = false;
      buildStart();
    } else {
      syncMode(); // restores start/plan pickers per the recurring toggle
    }
  }

  // --- start date (shared by both modes) ------------------------------------

  function buildStart() {
    const seg = el("startSeg");
    seg.innerHTML = SELECTABLE.map(
      (h) => `<button data-id="${h.id}" aria-pressed="${h.id === S.startId}">${h.label}</button>`,
    ).join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        S.startId = P.startId = (b as HTMLButtonElement).dataset.id!;
        press(seg.children, b);
        buildMat();
        paint();
      };
    });
  }

  // --- contribution plan (recurring) ----------------------------------------

  function buildPlan() {
    const seg = el("planSeg");
    const chosen = new Set(S.plan ?? []);
    seg.innerHTML = SELECTABLE.map(
      (h) => `<button data-id="${h.id}" aria-pressed="${chosen.has(h.id)}">${h.label}</button>`,
    ).join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => togglePlanMonth((b as HTMLButtonElement).dataset.id!);
    });
    updatePlanHint();
  }

  function togglePlanMonth(id: string) {
    const set = new Set(S.plan ?? []);
    if (set.has(id)) {
      if (set.size <= 1) return; // always keep at least one contribution month
      set.delete(id);
    } else {
      set.add(id);
    }
    commitPlan([...set]);
  }

  /** Adopt a new set of plan months: sort, anchor the start id, re-render. */
  function commitPlan(ids: string[]) {
    const sorted = ids.filter((id) => byId[id]).sort();
    if (sorted.length === 0) return;
    S.plan = sorted;
    S.startId = P.startId = sorted[0]; // keep the start issuance equal to the first month
    buildPlan();
    buildMat();
    paint();
  }

  function updatePlanHint() {
    const n = S.plan?.length ?? 0;
    const w = ccyWord(S.currency);
    el("planHint").textContent =
      n > 0
        ? `Investești ${fmt(S.amount)} ${w} în fiecare din ${n} ${
            n === 1 ? "lună" : "luni"
          } · total ${fmt(S.amount * n)} ${w}.`
        : "";
  }

  // --- contribution mode (lump vs recurring) --------------------------------

  function bindContrib() {
    el("contribSeg")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => (b.dataset.mode === "recurring" ? enterRecurring() : enterLump());
      });
    el("planAll").onclick = () => commitPlan(SELECTABLE.map((h) => h.id));
    el("planClear").onclick = () => commitPlan([S.plan?.[0] ?? S.startId]);
  }

  function enterRecurring() {
    if (!isRecurring()) S.plan = [S.startId];
    syncMode();
    paint();
  }

  function enterLump() {
    if (isRecurring()) {
      S.startId = P.startId = S.plan![0];
      S.plan = undefined;
    }
    syncMode();
    paint();
  }

  /** Reflect the active mode onto the toggle, panels, amount label and pickers. */
  function syncMode() {
    const rec = isRecurring();
    el("contribSeg")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((x) =>
        x.setAttribute("aria-pressed", String(x.dataset.mode === (rec ? "recurring" : "lump"))),
      );
    el("startWrap").hidden = rec;
    el("planWrap").hidden = !rec;
    const w = ccyWord(S.currency);
    el("amountLabel").textContent = rec ? `Sumă / lună (${w})` : `Sumă investită (${w})`;
    if (rec) buildPlan();
    else buildStart();
  }

  // --- currency (RON / EUR) --------------------------------------------------

  function bindCurrency() {
    el("currencySeg")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => {
          S.currency = P.currency = b.dataset.ccy as SimParams["currency"];
          applyCurrency();
          buildMat();
          paint();
        };
      });
  }

  /** Reflect the currency: relabel amounts, hide the RON-only donor tranches. */
  function applyCurrency() {
    const eur = S.currency === "EUR";
    press(el("currencySeg").children, [...el("currencySeg").children].find(
      (x) => (x as HTMLButtonElement).dataset.ccy === S.currency,
    ) as Element);
    el("donorWrap").style.display = eur ? "none" : "flex";
    el("donorEligWrap").style.display = eur ? "none" : "flex";
    if (eur) {
      S.donor = false;
      P.donorEligible = false;
      el<HTMLInputElement>("donor").checked = false;
      el<HTMLInputElement>("donorElig").checked = false;
    }
    const rec = isRecurring();
    const w = ccyWord(S.currency);
    el("amountLabel").textContent = rec ? `Sumă / lună (${w})` : `Sumă investită (${w})`;
    updatePlanHint();
  }

  // --- maturity, strategy, horizon ------------------------------------------

  function buildMat() {
    const seg = el("matSeg");
    const mats = matsAt(S.startId, S.currency);
    if (!mats.includes(S.mat)) S.mat = mats.includes(5) ? 5 : mats[mats.length - 1];
    seg.innerHTML = mats
      .map((m) => `<button data-m="${m}" aria-pressed="${m === S.mat}">${m} ani</button>`)
      .join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        S.mat = Number((b as HTMLButtonElement).dataset.m);
        press(seg.children, b);
        paint();
      };
    });
    el("matWrap").style.display = S.strat === "single" ? "block" : "none";
  }

  function bindStrat() {
    const seg = el("stratSeg");
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        S.strat = b.dataset.strat as SimParams["strat"];
        press(seg.children, b);
        buildMat();
        paint();
      };
    });
  }

  function syncStrat() {
    const seg = el("stratSeg");
    press(
      seg.children,
      [...seg.children].find((x) => (x as HTMLButtonElement).dataset.strat === S.strat) as Element,
    );
  }

  function bindHorizon() {
    const seg = el("horizonSeg");
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        S.horizon = b.dataset.hz as Horizon;
        press(seg.children, b);
        paint();
      };
    });
  }

  function syncHorizon() {
    const seg = el("horizonSeg");
    press(
      seg.children,
      [...seg.children].find(
        (x) => (x as HTMLButtonElement).dataset.hz === (S.horizon ?? "now"),
      ) as Element,
    );
  }

  // --- planner controls ------------------------------------------------------

  function bindPlanControls() {
    el<HTMLInputElement>("monthly").oninput = (e) => {
      P.monthly = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
      paint();
    };
    const hseg = el("planHorizonSeg");
    hseg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        P.horizonYears = Number(b.dataset.y);
        press(hseg.children, b);
        paint();
      };
    });
    const rseg = el("riskSeg");
    rseg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        P.risk = b.dataset.r as Risk;
        press(rseg.children, b);
        paint();
      };
    });
    el<HTMLInputElement>("donorElig").onchange = (e) => {
      P.donorEligible = (e.target as HTMLInputElement).checked;
      paint();
    };
    el<HTMLInputElement>("planReinvest").onchange = (e) => {
      P.reinvest = (e.target as HTMLInputElement).checked;
      paint();
    };
  }

  // --- backtester inputs -----------------------------------------------------

  el<HTMLInputElement>("amount").oninput = (e) => {
    S.amount = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
    updatePlanHint();
    paint();
  };
  el<HTMLInputElement>("donor").onchange = (e) => {
    S.donor = (e.target as HTMLInputElement).checked;
    paint();
  };
  el<HTMLInputElement>("reinvest").onchange = (e) => {
    S.reinvest = (e.target as HTMLInputElement).checked;
    paint();
  };

  /** Reflect the whole state object back onto every control. */
  function syncControls() {
    el<HTMLInputElement>("amount").value = String(S.amount);
    el<HTMLInputElement>("donor").checked = S.donor;
    el<HTMLInputElement>("reinvest").checked = S.reinvest;
    syncStrat();
    syncHorizon();
    applyCurrency();
    buildMat();
    syncMode();
  }

  bindMode();
  bindContrib();
  bindCurrency();
  bindStrat();
  bindHorizon();
  bindPlanControls();
  syncControls();
  applyMode();
  paint();

  return {
    getParams: () => ({ ...S, ...(S.plan ? { plan: [...S.plan] } : {}) }),
    setParams: (p) => {
      Object.assign(S, p);
      if (!p.plan || p.plan.length === 0) delete S.plan;
      P.startId = S.startId;
      P.currency = S.currency;
      syncControls();
      paint();
    },
    subscribe: (cb) => {
      subscribers.push(cb);
    },
  };
}
