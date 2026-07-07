import { HISTORY } from "../data/history";
import { matsAt } from "../sim/history";
import type { PlanParams, Risk } from "../sim/planner";
import type { SimParams } from "../sim/simulate";
import { render, renderPlan, type RenderTargets } from "./render";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

/** Toggle `aria-pressed` across a segmented button group. */
const press = (buttons: Iterable<Element>, active: Element) => {
  for (const b of buttons) b.setAttribute("aria-pressed", String(b === active));
};

type Mode = "backtest" | "plan";

/**
 * Wire the controls to the render layer. Two modes — the historic backtester
 * and the forward ladder planner — share a single mutable state object each and
 * a common start-date selector; switching mode just swaps which one is painted.
 */
export function createApp(): void {
  let mode: Mode = "backtest";

  const S: SimParams = {
    amount: 50000,
    startId: "2025-02",
    strat: "single",
    mat: 5,
    donor: false,
    reinvest: true,
  };

  const P: PlanParams = {
    monthly: 1000,
    horizonYears: 3,
    startId: S.startId,
    risk: "balanced",
    donorEligible: false,
    reinvest: true,
  };

  const targets: RenderTargets = {
    headline: el("headline"),
    viz: el("viz"),
    detail: el("detail"),
  };

  const paint = () =>
    mode === "backtest" ? render(S, targets) : renderPlan(P, targets);

  function applyMode() {
    el("backtestControls").style.display = mode === "backtest" ? "block" : "none";
    el("planControls").style.display = mode === "plan" ? "block" : "none";
    el("matWrap").style.display =
      mode === "backtest" && S.strat === "single" ? "block" : "none";
  }

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

  function buildStart() {
    const seg = el("startSeg");
    seg.innerHTML = HISTORY.filter((h) => h.id >= "2024-10")
      .map(
        (h) =>
          `<button data-id="${h.id}" aria-pressed="${h.id === S.startId}">${h.label}</button>`,
      )
      .join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        S.startId = P.startId = (b as HTMLButtonElement).dataset.id!;
        press(seg.children, b);
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
        press(seg.children, b);
        paint();
      };
    });
    el("matWrap").style.display =
      mode === "backtest" && S.strat === "single" ? "block" : "none";
  }

  function bindStrat() {
    const seg = el("stratSeg");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        S.strat = (b as HTMLButtonElement).dataset.strat as SimParams["strat"];
        press(seg.children, b);
        buildMat();
        paint();
      };
    });
  }

  function bindHorizon() {
    const seg = el("horizonSeg");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        P.horizonYears = Number((b as HTMLButtonElement).dataset.h);
        press(seg.children, b);
        paint();
      };
    });
  }

  function bindRisk() {
    const seg = el("riskSeg");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        P.risk = (b as HTMLButtonElement).dataset.r as Risk;
        press(seg.children, b);
        paint();
      };
    });
  }

  // Backtester inputs.
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

  // Planner inputs.
  el<HTMLInputElement>("monthly").oninput = (e) => {
    P.monthly = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
    paint();
  };
  el<HTMLInputElement>("donorElig").onchange = (e) => {
    P.donorEligible = (e.target as HTMLInputElement).checked;
    paint();
  };
  el<HTMLInputElement>("planReinvest").onchange = (e) => {
    P.reinvest = (e.target as HTMLInputElement).checked;
    paint();
  };

  bindMode();
  buildStart();
  bindStrat();
  bindHorizon();
  bindRisk();
  buildMat();
  applyMode();
  paint();
}
