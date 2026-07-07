import { FIRST_SELECTABLE, HISTORY } from "../data/history";
import { byId, hasCurrency, matsAt } from "../sim/history";
import { currencyOf, type Currency, type SimParams } from "../sim/simulate";
import { fmt } from "./format";
import { render, type RenderTargets } from "./render";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

/** Issuances offered as start / contribution months. */
const SELECTABLE = HISTORY.filter((h) => h.id >= FIRST_SELECTABLE);

/** The default scenario shown on first load. */
export const DEFAULT_PARAMS: SimParams = {
  amount: 50000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
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
 * controller so other UI modules (scenarios, export) can drive it.
 */
export function createApp(initial?: SimParams | null): AppController {
  const S: SimParams = { ...DEFAULT_PARAMS, ...(initial ?? {}) };

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
    render(S, targets);
    const snapshot = { ...S, ...(S.plan ? { plan: [...S.plan] } : {}) };
    subscribers.forEach((cb) => cb(snapshot));
  };

  /** A recurring plan is active when it holds at least one contribution month. */
  const isRecurring = () => !!(S.plan && S.plan.length > 0);

  /** The active tranche currency (RON unless EUR is explicitly chosen). */
  const cur = (): Currency => currencyOf(S);

  /** Whether an issuance offers a tranche in the active currency. */
  const offered = (id: string) => hasCurrency(byId[id], cur());

  /** Selectable months that offer a tranche in the active currency. */
  const availableMonths = () => SELECTABLE.filter((h) => offered(h.id));

  // --- start date (lump) -----------------------------------------------------

  function buildStart() {
    const seg = el("startSeg");
    seg.innerHTML = SELECTABLE.map((h) => {
      const has = offered(h.id);
      const attrs = has
        ? ""
        : ` disabled title="Fără tranșă în ${cur()} la această emisiune"`;
      return `<button data-id="${h.id}" aria-pressed="${h.id === S.startId}"${attrs}>${h.label}</button>`;
    }).join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        if ((b as HTMLButtonElement).disabled) return;
        S.startId = (b as HTMLButtonElement).dataset.id!;
        [...seg.children].forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b)),
        );
        buildMat();
        paint();
      };
    });
  }

  // --- contribution plan (recurring) ----------------------------------------

  function buildPlan() {
    const seg = el("planSeg");
    const chosen = new Set(S.plan ?? []);
    seg.innerHTML = SELECTABLE.map((h) => {
      const has = offered(h.id);
      const attrs = has
        ? ""
        : ` disabled title="Fără tranșă în ${cur()} la această emisiune"`;
      return `<button data-id="${h.id}" aria-pressed="${chosen.has(h.id)}"${attrs}>${h.label}</button>`;
    }).join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        if ((b as HTMLButtonElement).disabled) return;
        togglePlanMonth((b as HTMLButtonElement).dataset.id!);
      };
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
    S.startId = sorted[0]; // keep the start issuance equal to the first month
    buildPlan();
    buildMat();
    paint();
  }

  function updatePlanHint() {
    const n = S.plan?.length ?? 0;
    const c = cur();
    el("planHint").textContent =
      n > 0
        ? `Investești ${fmt(S.amount)} ${c} în fiecare din ${n} ${
            n === 1 ? "lună" : "luni"
          } · total ${fmt(S.amount * n)} ${c}.`
        : "";
  }

  // --- contribution mode (lump vs recurring) --------------------------------

  function bindContrib() {
    el("contribSeg")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => (b.dataset.mode === "recurring" ? enterRecurring() : enterLump());
      });
    el("planAll").onclick = () => commitPlan(availableMonths().map((h) => h.id));
    el("planClear").onclick = () => commitPlan([S.plan?.[0] ?? S.startId]);
  }

  function enterRecurring() {
    if (!isRecurring()) S.plan = [S.startId];
    syncMode();
    paint();
  }

  function enterLump() {
    if (isRecurring()) {
      S.startId = S.plan![0];
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
    el("amountLabel").textContent = rec ? `Sumă / lună (${cur()})` : `Sumă investită (${cur()})`;
    if (rec) buildPlan();
    else buildStart();
  }

  // --- maturity & strategy ---------------------------------------------------

  function buildMat() {
    const seg = el("matSeg");
    const mats = matsAt(S.startId, cur());
    if (!mats.includes(S.mat)) S.mat = mats.includes(5) ? 5 : mats[mats.length - 1];
    seg.innerHTML = mats
      .map((m) => `<button data-m="${m}" aria-pressed="${m === S.mat}">${m} ani</button>`)
      .join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        S.mat = Number((b as HTMLButtonElement).dataset.m);
        [...seg.children].forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b)),
        );
        paint();
      };
    });
    el("matWrap").style.display = S.strat === "single" ? "block" : "none";
  }

  function bindStrat() {
    document.querySelectorAll<HTMLButtonElement>("#stratSeg button").forEach((b) => {
      b.onclick = () => {
        S.strat = b.dataset.strat as SimParams["strat"];
        syncStrat();
        buildMat();
        paint();
      };
    });
  }

  function syncStrat() {
    document
      .querySelectorAll("#stratSeg button")
      .forEach((x) => x.setAttribute("aria-pressed", String((x as HTMLButtonElement).dataset.strat === S.strat)));
  }

  // --- currency (RON vs EUR) -------------------------------------------------

  function bindCurrency() {
    document.querySelectorAll<HTMLButtonElement>("#currencySeg button").forEach((b) => {
      b.onclick = () => setCurrency(b.dataset.cur === "eur" ? "EUR" : "RON");
    });
  }

  function syncCurrency() {
    document
      .querySelectorAll<HTMLButtonElement>("#currencySeg button")
      .forEach((x) =>
        x.setAttribute("aria-pressed", String((x.dataset.cur === "eur" ? "EUR" : "RON") === cur())),
      );
    // The blood-donor tranche is a RON-only product; disable it under EUR.
    const donorEl = el<HTMLInputElement>("donor");
    const eur = cur() === "EUR";
    donorEl.disabled = eur;
    if (eur && S.donor) S.donor = false;
    donorEl.closest("label")?.classList.toggle("disabled", eur);
  }

  /**
   * Switch the tranche currency. Not every issuance offers a EUR tranche, so
   * the start month (or every plan month) snaps onto months that do; the
   * maturity, amount label and pickers then re-resolve for the new currency.
   */
  function setCurrency(next: Currency) {
    if (cur() === next) return;
    S.currency = next === "EUR" ? "EUR" : undefined;
    if (isRecurring()) {
      const kept = (S.plan ?? []).filter((id) => offered(id));
      S.plan = (kept.length > 0 ? kept : [availableMonths()[0].id]).sort();
      S.startId = S.plan[0];
    } else if (!offered(S.startId)) {
      S.startId = availableMonths()[0].id;
    }
    syncCurrency();
    syncMode();
    buildMat();
    paint();
  }

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
    syncCurrency();
    syncStrat();
    buildMat();
    syncMode();
  }

  bindContrib();
  bindStrat();
  bindCurrency();
  syncControls();
  paint();

  return {
    getParams: () => ({ ...S, ...(S.plan ? { plan: [...S.plan] } : {}) }),
    setParams: (p) => {
      Object.assign(S, p);
      if (!p.plan || p.plan.length === 0) delete S.plan;
      syncControls();
      paint();
    },
    subscribe: (cb) => {
      subscribers.push(cb);
    },
  };
}
