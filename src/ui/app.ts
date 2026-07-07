import { FIRST_SELECTABLE, HISTORY } from "../data/history";
import { matsAt } from "../sim/history";
import type { SimParams } from "../sim/simulate";
import { render, type RenderTargets } from "./render";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

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
    viz: el("viz"),
    detail: el("detail"),
  };

  const subscribers: Array<(p: SimParams) => void> = [];
  const paint = () => {
    render(S, targets);
    const snapshot = { ...S };
    subscribers.forEach((cb) => cb(snapshot));
  };

  function buildStart() {
    const seg = el("startSeg");
    seg.innerHTML = HISTORY.filter((h) => h.id >= FIRST_SELECTABLE)
      .map(
        (h) =>
          `<button data-id="${h.id}" aria-pressed="${h.id === S.startId}">${h.label}</button>`,
      )
      .join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        S.startId = (b as HTMLButtonElement).dataset.id!;
        [...seg.children].forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b)),
        );
        buildMat();
        paint();
      };
    });
  }

  function buildMat() {
    const seg = el("matSeg");
    const mats = matsAt(S.startId);
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

  el<HTMLInputElement>("amount").oninput = (e) => {
    S.amount = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
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
    buildStart();
    syncStrat();
    buildMat();
  }

  buildStart();
  bindStrat();
  syncStrat();
  buildMat();
  syncControls();
  paint();

  return {
    getParams: () => ({ ...S }),
    setParams: (p) => {
      Object.assign(S, p);
      syncControls();
      paint();
    },
    subscribe: (cb) => {
      subscribers.push(cb);
    },
  };
}
