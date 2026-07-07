import { HISTORY } from "../data/history";
import { matsAt } from "../sim/history";
import type { SimParams } from "../sim/simulate";
import { render, type RenderTargets } from "./render";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

/**
 * Wire the controls to the render layer over a single mutable state object,
 * mirroring the original single-file app's interaction model.
 */
export function createApp(): void {
  const S: SimParams = {
    amount: 50000,
    startId: "2025-02",
    strat: "single",
    mat: 5,
    donor: false,
    reinvest: true,
  };

  const targets: RenderTargets = {
    headline: el("headline"),
    viz: el("viz"),
    detail: el("detail"),
  };

  const paint = () => render(S, targets);

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
        document
          .querySelectorAll("#stratSeg button")
          .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        buildMat();
        paint();
      };
    });
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

  buildStart();
  bindStrat();
  buildMat();
  paint();
}
