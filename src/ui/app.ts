import { HISTORY } from "../data/history";
import { defaultBase } from "../forecast";
import { matsAt } from "../sim/history";
import type { SimParams } from "../sim/simulate";
import { renderForecast, type ForecastTargets } from "./forecast";
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

  wireForecast();
}

/**
 * Wire the scenario forecast module: three static base-macro inputs feeding a
 * pure re-render. Kept separate from the backtester state — it has its own
 * mutable base assumption and its own render targets.
 */
function wireForecast(): void {
  // Mutable base assumption (structurally satisfies the readonly MacroAssumption).
  const base = { nbr: defaultBase.nbr, cpi: defaultBase.cpi, eurRon: defaultBase.eurRon };

  const targets: ForecastTargets = {
    bands: el("fcBands"),
    scenarios: el("fcScenarios"),
    model: el("fcModel"),
  };

  const nbr = el<HTMLInputElement>("fcNbr");
  const cpi = el<HTMLInputElement>("fcCpi");
  const eur = el<HTMLInputElement>("fcEur");

  const syncInputs = () => {
    nbr.value = String(base.nbr);
    cpi.value = String(base.cpi);
    eur.value = String(base.eurRon);
  };
  const paintForecast = () => renderForecast(base, targets);

  nbr.oninput = () => {
    base.nbr = Number(nbr.value) || 0;
    paintForecast();
  };
  cpi.oninput = () => {
    base.cpi = Number(cpi.value) || 0;
    paintForecast();
  };
  eur.oninput = () => {
    base.eurRon = Number(eur.value) || 0;
    paintForecast();
  };
  el<HTMLButtonElement>("fcReset").onclick = () => {
    base.nbr = defaultBase.nbr;
    base.cpi = defaultBase.cpi;
    base.eurRon = defaultBase.eurRon;
    syncInputs();
    paintForecast();
  };

  syncInputs();
  paintForecast();
}
