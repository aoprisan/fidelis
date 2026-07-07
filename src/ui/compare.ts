import { byId } from "../sim/history";
import type { SimParams } from "../sim/simulate";
import {
  bestByCagr,
  boundsOf,
  buildComparison,
  seriesCurve,
  type CompareInput,
  type CompareSeries,
} from "../scenario/compare";
import type { ScenarioStore } from "../scenario/store";
import type { AppController } from "./app";
import { fmt, fmt2, fmtK } from "./format";

/**
 * The "Compară scenarii" view: pick the current scenario and any saved ones,
 * then see their value curves overlaid on one chart and their headline figures
 * side by side. Absolute (RON) or indexed-to-100 so different sizes compare
 * fairly. DOM glue only — the maths lives in `scenario/compare.ts`.
 */

/** Distinct, dark-theme-legible line colors, cycled across selected series. */
const SERIES_COLORS = [
  "#d8a54a", // gold
  "#57b98a", // green
  "#6aa9e0", // blue
  "#c98bdb", // violet
  "#e0906a", // coral
  "#8bd0c0", // teal
  "#c7b45e", // olive
  "#a0a8d8", // periwinkle
];

const CURRENT_ID = "__current__";

function stratLabel(p: SimParams): string {
  return p.strat === "ladder" ? "Scară" : `${p.mat} ani`;
}

/** Start column: the single issuance, or the span of a recurring plan. */
function startLabel(p: SimParams): string {
  if (p.plan && p.plan.length > 1) {
    return `${byId[p.plan[0]].label} → ${byId[p.plan[p.plan.length - 1]].label} (${p.plan.length})`;
  }
  return byId[p.startId].label;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Public handle: force a re-render (e.g. after a save/delete elsewhere). */
export interface ComparePanel {
  refresh(): void;
}

export function initCompare(
  app: AppController,
  store: ScenarioStore,
  getCurrentName: () => string,
): ComparePanel {
  const found = document.getElementById("compare");
  if (!found) throw new Error("Missing element #compare");
  const root: HTMLElement = found;

  const selectedSaved = new Set<string>();
  let knownIds = new Set<string>();
  let includeCurrent = true;
  let normalized = false;
  let initialized = false;

  /** Keep the selection in step with what is actually stored. */
  function syncSelection(savedIds: string[]): void {
    const ids = new Set(savedIds);
    if (!initialized) {
      savedIds.forEach((id) => selectedSaved.add(id));
      initialized = true;
    } else {
      // auto-select any newly saved scenario
      savedIds.forEach((id) => {
        if (!knownIds.has(id)) selectedSaved.add(id);
      });
    }
    for (const id of [...selectedSaved]) if (!ids.has(id)) selectedSaved.delete(id);
    knownIds = ids;
  }

  function render(): void {
    const saved = store.all().sort((a, b) => b.updatedAt - a.updatedAt);
    syncSelection(saved.map((s) => s.id));

    // Selected inputs, in draw order: current first, then saved (most-recent first).
    const inputs: CompareInput[] = [];
    if (includeCurrent) {
      inputs.push({ id: CURRENT_ID, name: getCurrentName(), params: app.getParams() });
    }
    for (const s of saved) {
      if (selectedSaved.has(s.id)) inputs.push({ id: s.id, name: s.name, params: s.params });
    }

    const series = buildComparison(inputs);
    const colorOf = new Map<string, string>();
    series.forEach((s, i) => colorOf.set(s.id, SERIES_COLORS[i % SERIES_COLORS.length]));

    const chips = chipsHTML(saved, colorOf);
    const body =
      series.length >= 2
        ? chartHTML(series, colorOf, normalized) + tableHTML(series, colorOf)
        : `<p class="cmp-empty">${
            saved.length === 0
              ? "Salvează scenarii în panoul din stânga, apoi selectează-le aici ca să le compari."
              : "Selectează cel puțin două scenarii pentru comparație."
          }</p>`;

    root.innerHTML = `
      <div class="cmp-head">
        <h2>Compară scenarii</h2>
        <div class="seg cmp-mode" role="group" aria-label="Mod de afișare">
          <button data-mode="abs" aria-pressed="${!normalized}" title="Valoare absolută (nu amestecă monede)">Absolut</button>
          <button data-mode="idx" aria-pressed="${normalized}" title="Indexat la 100 la start">Index 100</button>
        </div>
      </div>
      <div class="cmp-chips">${chips}</div>
      <div class="cmp-body">${body}</div>`;

    wire();
  }

  function wire(): void {
    root.querySelectorAll<HTMLButtonElement>(".cmp-mode button").forEach((b) => {
      b.onclick = () => {
        normalized = b.dataset.mode === "idx";
        render();
      };
    });
    root.querySelectorAll<HTMLButtonElement>(".cmp-chip").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id!;
        if (id === CURRENT_ID) includeCurrent = !includeCurrent;
        else if (selectedSaved.has(id)) selectedSaved.delete(id);
        else selectedSaved.add(id);
        render();
      };
    });
  }

  // Live-update the "current scenario" curve as the controls change.
  app.subscribe(() => render());
  render();

  return { refresh: render };
}

// --- selection chips -------------------------------------------------------

function chipsHTML(
  saved: { id: string; name: string; params: SimParams }[],
  colorOf: Map<string, string>,
): string {
  const chip = (id: string, name: string, active: boolean): string => {
    const color = colorOf.get(id);
    const swatch = active && color ? `background:${color};border-color:${color}` : "";
    return `<button type="button" class="cmp-chip${active ? " on" : ""}" data-id="${id}" aria-pressed="${active}">
      <span class="cmp-swatch" style="${swatch}"></span>${escapeHtml(name)}
    </button>`;
  };
  const currentActive = colorOf.has(CURRENT_ID);
  const parts = [chip(CURRENT_ID, "Scenariul curent", currentActive)];
  for (const s of saved) parts.push(chip(s.id, s.name, colorOf.has(s.id)));
  return parts.join("");
}

// --- overlaid value chart --------------------------------------------------

function chartHTML(
  series: CompareSeries[],
  colorOf: Map<string, string>,
  normalized: boolean,
): string {
  const curves = series.map((s) => seriesCurve(s, normalized));
  const b = boundsOf(curves);
  if (!b) return "";

  const W = 760;
  const H = 300;
  const m = { top: 16, right: 18, bottom: 28, left: 58 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const tSpan = Math.max(b.maxT - b.minT, 1e-6);
  // Include the reference level (100 when indexed) in the y-range.
  const lo0 = normalized ? Math.min(b.minV, 100) : b.minV;
  const hi0 = normalized ? Math.max(b.maxV, 100) : b.maxV;
  const pad = hi0 - lo0 > 0 ? hi0 - lo0 : Math.max(hi0 * 0.02, 1);
  const yLo = Math.max(0, lo0 - pad * 0.12);
  const yHi = hi0 + pad * 0.12;
  const ySpan = Math.max(yHi - yLo, 1e-6);

  const sx = (t: number): number => px0 + ((t - b.minT) / tSpan) * (px1 - px0);
  const sy = (v: number): number => py1 - ((v - yLo) / ySpan) * (py1 - py0);
  const r = (n: number): number => Math.round(n * 100) / 100;

  // grid + y labels
  const rows = 4;
  const grid: string[] = [];
  const yLabels: string[] = [];
  for (let i = 0; i <= rows; i++) {
    const v = yLo + (ySpan * i) / rows;
    const yy = r(sy(v));
    grid.push(`<line x1="${px0}" y1="${yy}" x2="${px1}" y2="${yy}" class="cmp-grid" />`);
    yLabels.push(
      `<text x="${px0 - 8}" y="${yy + 3.5}" class="cmp-ylab">${normalized ? fmt(v) : fmtK(v)}</text>`,
    );
  }

  // x ticks (whole years)
  const xTicks: string[] = [];
  for (let yr = Math.ceil(b.minT); yr <= Math.floor(b.maxT); yr++) {
    const xx = r(sx(yr));
    xTicks.push(
      `<line x1="${xx}" y1="${py1}" x2="${xx}" y2="${py1 + 4}" class="cmp-grid" />` +
        `<text x="${xx}" y="${py1 + 16}" class="cmp-xlab" text-anchor="middle">${yr}</text>`,
    );
  }

  // reference line at 100 in index mode
  let refLine = "";
  if (normalized) {
    const yy = r(sy(100));
    if (yy >= py0 && yy <= py1) {
      refLine = `<line x1="${px0}" y1="${yy}" x2="${px1}" y2="${yy}" class="cmp-ref" />
        <text x="${px1}" y="${yy - 5}" text-anchor="end" class="cmp-reflab">100 · start</text>`;
    }
  }

  // one polyline + end dot per series
  const lines = series
    .map((s, i) => {
      const pts = curves[i];
      if (pts.length < 2) return "";
      const color = colorOf.get(s.id)!;
      const d = pts.map((p, j) => `${j ? "L" : "M"}${r(sx(p.t))} ${r(sy(p.value))}`).join(" ");
      const last = pts[pts.length - 1];
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.9"
                stroke-linejoin="round" stroke-linecap="round"><title>${escapeHtml(s.name)}</title></path>
        <circle cx="${r(sx(last.t))}" cy="${r(sy(last.value))}" r="3.5" fill="${color}" stroke="#131f33" stroke-width="1.5" />`;
    })
    .join("");

  return `
    <div class="cmp-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparație a evoluției valorii între scenarii">
        ${grid.join("")}
        ${xTicks.join("")}
        ${refLine}
        ${lines}
        ${yLabels.join("")}
      </svg>
    </div>`;
}

// --- side-by-side figures --------------------------------------------------

function tableHTML(series: CompareSeries[], colorOf: Map<string, string>): string {
  const best = bestByCagr(series);
  const rows = series
    .map((s, i) => {
      const color = colorOf.get(s.id)!;
      const p = s.params;
      const isBest = i === best;
      return `<tr${isBest ? ' class="cmp-best"' : ""}>
        <td class="cmp-name">
          <span class="cmp-swatch" style="background:${color};border-color:${color}"></span>
          ${escapeHtml(s.name)}${isBest ? ' <span class="cmp-tag">cel mai bun</span>' : ""}
        </td>
        <td class="num">${fmt(p.amount)}</td>
        <td>${escapeHtml(startLabel(p))}</td>
        <td>${stratLabel(p)}</td>
        <td class="num">${fmt(s.summary.finalValue)}</td>
        <td class="num pos">+${fmt(s.summary.profit)}</td>
        <td class="num">${fmt2(s.summary.cagr)}%</td>
      </tr>`;
    })
    .join("");
  return `
    <table class="detail cmp-table">
      <thead><tr>
        <th>Scenariu</th><th>Sumă</th><th>Start</th><th>Strat.</th>
        <th>Valoare azi</th><th>Câștig</th><th>Rand.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
