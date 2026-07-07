import { BNR_SOURCE, ECB_SOURCE, EUROSTAT_SOURCE, INS_SOURCE } from "../data/benchmarks";
import type { BenchmarkSummary } from "../sim/benchmark";
import type { Currency, ValuePoint } from "../sim/simulate";
import { fmt, fmtK } from "./format";

/** One named curve on the comparison chart. */
interface Series {
  points: ValuePoint[];
  cls: string;
}

/**
 * Three-series comparison chart: Fidelis vs the taxed-deposit alternative vs
 * the inflation-adjusted (real) Fidelis value. Same geometry conventions as
 * the growth chart so the two read as one family.
 */
function benchChartSVG(series: Series[], invested: number): string {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return "";

  const W = 720;
  const H = 250;
  const m = { top: 18, right: 18, bottom: 26, left: 54 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const minT = Math.min(...all.map((p) => p.t));
  const maxT = Math.max(...all.map((p) => p.t));
  const tSpan = Math.max(maxT - minT, 1e-6);

  const values = all.map((p) => p.value);
  const dataMin = Math.min(invested, ...values);
  const dataMax = Math.max(invested, ...values);
  const pad = dataMax - dataMin > 0 ? dataMax - dataMin : Math.max(dataMax * 0.02, 1);
  const yLo = Math.max(0, dataMin - pad * 0.6);
  const yHi = dataMax + pad * 0.35;
  const ySpan = Math.max(yHi - yLo, 1e-6);

  const sx = (t: number): number => px0 + ((t - minT) / tSpan) * (px1 - px0);
  const sy = (v: number): number => py1 - ((v - yLo) / ySpan) * (py1 - py0);
  const round = (n: number): number => Math.round(n * 100) / 100;

  const rows = 4;
  const grid: string[] = [];
  const yLabels: string[] = [];
  for (let i = 0; i <= rows; i++) {
    const v = yLo + (ySpan * i) / rows;
    const yy = round(sy(v));
    grid.push(`<line x1="${px0}" y1="${yy}" x2="${px1}" y2="${yy}" class="gc-grid" />`);
    yLabels.push(`<text x="${px0 - 8}" y="${yy + 3.5}" class="gc-ylab">${fmtK(v)}</text>`);
  }

  const xTicks: string[] = [];
  for (let yr = Math.ceil(minT); yr <= Math.floor(maxT); yr++) {
    const xx = round(sx(yr));
    xTicks.push(
      `<line x1="${xx}" y1="${py1}" x2="${xx}" y2="${py1 + 4}" class="gc-grid" />` +
        `<text x="${xx}" y="${py1 + 16}" class="gc-xlab" text-anchor="middle">${yr}</text>`,
    );
  }

  const byBase = round(sy(invested));
  const baseline =
    byBase >= py0 && byBase <= py1
      ? `<line x1="${px0}" y1="${byBase}" x2="${px1}" y2="${byBase}" class="gc-base" />
         <text x="${px1}" y="${byBase - 6}" text-anchor="end" class="gc-baselab">Investit · ${fmtK(invested)}</text>`
      : "";

  const lines = series
    .map((s) => {
      const d = s.points
        .map((p, i) => `${i ? "L" : "M"}${round(sx(p.t))} ${round(sy(p.value))}`)
        .join(" ");
      return `<path d="${d}" class="${s.cls}" />`;
    })
    .join("");

  return `
    <div class="growthchart bench-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="Comparație: Fidelis față de un depozit bancar impozitat și față de valoarea reală după inflație">
        ${grid.join("")}
        ${xTicks.join("")}
        ${lines}
        ${baseline}
        ${yLabels.join("")}
      </svg>
    </div>`;
}

/**
 * The "why Fidelis" section: comparison chart, legend with final values, and
 * the three quantified arguments (advantage vs deposit, tax avoided, real
 * gain after inflation).
 */
export function benchmarkSectionHTML(
  fidelisPoints: ValuePoint[],
  depositPoints: ValuePoint[],
  realPoints: ValuePoint[],
  invested: number,
  s: BenchmarkSummary,
  cur: Currency = "RON",
): string {
  if (fidelisPoints.length < 2) return "";
  const fidelisFinal = fidelisPoints[fidelisPoints.length - 1].value;
  const realCls = s.realProfit >= 0 ? "pos" : "neg";
  // The deposit alternative and the inflation series are currency-specific: lei
  // uses BNR RON deposits + INS prices; euro uses a Romanian EUR deposit rate +
  // euro-area HICP.
  const note =
    cur === "EUR"
      ? `Depozitul folosește o dobândă reprezentativă la depozitele în euro pentru clienții retail din România (surse <a href="${ECB_SOURCE}" target="_blank" rel="noopener">BNR/BCE</a>), capitalizare anuală și impozit de 10% pe dobândă. Valoarea reală folosește indicele armonizat al prețurilor din zona euro, IAPC (<a href="${EUROSTAT_SOURCE}" target="_blank" rel="noopener">Eurostat</a>). Dobânda Fidelis este scutită de impozit și CASS. Seria în euro este aproximativă — vezi sursele.`
      : `Depozitul folosește dobânda medie la depozitele noi în lei ale populației (<a href="${BNR_SOURCE}" target="_blank" rel="noopener">BNR</a>), capitalizare anuală și impozit de 10% pe dobândă. Valoarea reală folosește indicele prețurilor de consum (<a href="${INS_SOURCE}" target="_blank" rel="noopener">INS</a>). Dobânda Fidelis este scutită de impozit și CASS.`;
  return `
    <div class="laddertitle">Și dacă banii stăteau la bancă? Fidelis vs depozit vs inflație</div>
    <div class="bench-legend">
      <span class="bench-key"><i class="bl-fidelis"></i>Fidelis · ${fmtK(fidelisFinal)}</span>
      <span class="bench-key"><i class="bl-deposit"></i>Depozit bancar (net de impozit) · ${fmtK(s.depositFinal)}</span>
      <span class="bench-key"><i class="bl-real"></i>Fidelis în puterea de cumpărare de la start · ${fmtK(s.realFinal)}</span>
    </div>
    ${benchChartSVG(
      [
        { points: depositPoints, cls: "bench-deposit" },
        { points: realPoints, cls: "bench-real" },
        { points: fidelisPoints, cls: "bench-fidelis" },
      ],
      invested,
    )}
    <div class="headline bench-stats">
      <div class="stat"><div class="k">Avantaj vs depozit bancar</div><div class="v pos num">+${fmt(s.advantage)} ${cur}</div></div>
      <div class="stat"><div class="k">Impozit evitat (scutire Fidelis)</div><div class="v gold num">${fmt(s.taxSaved)} ${cur}</div></div>
      <div class="stat"><div class="k">Câștig real, după inflație</div><div class="v ${realCls} num">${s.realProfit >= 0 ? "+" : "−"}${fmt(Math.abs(s.realProfit))} ${cur}</div></div>
    </div>
    <p class="bench-note">${note}</p>`;
}
