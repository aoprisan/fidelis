import { END } from "../data/history";
import { benchmarkSummary, deflate, depositTrajectory } from "../sim/benchmark";
import { couponSchedule, scheduleByYear, type CashEvent } from "../sim/cashflow";
import { idToYear } from "../sim/history";
import {
  contributionMonths,
  currencyOf,
  run,
  summarizeOf,
  trajectory,
  type Currency,
  type Leg,
  type SimParams,
  type ValuePoint,
} from "../sim/simulate";
import { benchmarkSectionHTML } from "./benchmark";
import { fmt, fmt2, fmtK, fmtMonthYear } from "./format";

/** DOM targets the render layer writes into. */
export interface RenderTargets {
  headline: HTMLElement;
  chart: HTMLElement;
  bench: HTMLElement;
  viz: HTMLElement;
  detail: HTMLElement;
  calendar: HTMLElement;
}

function headlineHTML(finalValue: number, profit: number, cagr: number, cur: Currency): string {
  return `
    <div class="stat"><div class="k">Valoare azi</div><div class="v gold num">${fmt(finalValue)} ${cur}</div></div>
    <div class="stat"><div class="k">Câștig net (neimpozabil)</div><div class="v pos num">+${fmt(profit)} ${cur}</div></div>
    <div class="stat"><div class="k">Randament anualizat</div><div class="v num">${fmt2(cagr)}%</div></div>`;
}

/** Value-over-time growth chart as a self-contained, responsive inline SVG. */
function growthChartHTML(points: ValuePoint[], invested: number, cur: Currency): string {
  if (points.length < 2) return "";

  // viewBox geometry (scaled to fit by width:100% in CSS).
  const W = 720;
  const H = 250;
  const m = { top: 18, right: 18, bottom: 26, left: 54 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const tSpan = Math.max(maxT - minT, 1e-6);

  const values = points.map((p) => p.value);
  const dataMin = Math.min(invested, ...values);
  const dataMax = Math.max(invested, ...values);
  const pad = dataMax - dataMin > 0 ? dataMax - dataMin : Math.max(dataMax * 0.02, 1);
  const yLo = Math.max(0, dataMin - pad * 0.6);
  const yHi = dataMax + pad * 0.35;
  const ySpan = Math.max(yHi - yLo, 1e-6);

  const sx = (t: number): number => px0 + ((t - minT) / tSpan) * (px1 - px0);
  const sy = (v: number): number => py1 - ((v - yLo) / ySpan) * (py1 - py0);

  const round = (n: number): number => Math.round(n * 100) / 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${round(sx(p.t))} ${round(sy(p.value))}`).join(" ");
  const area = `${line} L${round(px1)} ${round(py1)} L${round(px0)} ${round(py1)} Z`;

  // horizontal grid + y labels
  const rows = 4;
  const grid: string[] = [];
  const yLabels: string[] = [];
  for (let i = 0; i <= rows; i++) {
    const v = yLo + (ySpan * i) / rows;
    const yy = round(sy(v));
    grid.push(`<line x1="${px0}" y1="${yy}" x2="${px1}" y2="${yy}" class="gc-grid" />`);
    yLabels.push(`<text x="${px0 - 8}" y="${yy + 3.5}" class="gc-ylab">${fmtK(v)}</text>`);
  }

  // x ticks at whole years within range
  const xTicks: string[] = [];
  for (let yr = Math.ceil(minT); yr <= Math.floor(maxT); yr++) {
    const xx = round(sx(yr));
    xTicks.push(
      `<line x1="${xx}" y1="${py1}" x2="${xx}" y2="${py1 + 4}" class="gc-grid" />` +
        `<text x="${xx}" y="${py1 + 16}" class="gc-xlab" text-anchor="middle">${yr}</text>`,
    );
  }

  // invested baseline
  const byBase = round(sy(invested));
  const baseline =
    byBase >= py0 && byBase <= py1
      ? `<line x1="${px0}" y1="${byBase}" x2="${px1}" y2="${byBase}" class="gc-base" />
         <text x="${px1}" y="${byBase - 6}" text-anchor="end" class="gc-baselab">Investit · ${fmtK(invested)}</text>`
      : "";

  // end marker + value tag
  const last = points[points.length - 1];
  const ex = round(sx(last.t));
  const ey = round(sy(last.value));
  const tagW = 96;
  const tagX = Math.min(ex + 10, px1 - tagW);
  const endTag = `
    <line x1="${ex}" y1="${ey}" x2="${ex}" y2="${py1}" class="gc-drop" />
    <g class="gc-tag" transform="translate(${round(tagX)}, ${round(Math.max(ey - 30, py0))})">
      <rect width="${tagW}" height="34" rx="3" />
      <text x="9" y="14" class="gc-tagk">VALOARE AZI</text>
      <text x="9" y="28" class="gc-tagv">${fmt(last.value)}</text>
    </g>
    <circle cx="${ex}" cy="${ey}" r="4" class="gc-end" />`;

  return `
    <div class="laddertitle">Evoluția valorii în timp</div>
    <div class="growthchart">
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="Grafic al evoluției valorii investiției de la ${fmt(invested)} la ${fmt(last.value)} ${cur}">
        <defs>
          <linearGradient id="gcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(216,165,74,0.34)" />
            <stop offset="100%" stop-color="rgba(216,165,74,0.02)" />
          </linearGradient>
        </defs>
        ${grid.join("")}
        ${xTicks.join("")}
        <path d="${area}" fill="url(#gcFill)" />
        <path d="${line}" class="gc-line" />
        ${baseline}
        ${endTag}
        ${yLabels.join("")}
      </svg>
    </div>`;
}

function vizHTML(allLegs: Leg[], startId: string): string {
  const minY = idToYear(startId);
  const maxY = END;
  const span = maxY - minY;
  const lanes = allLegs
    .map((leg) => {
      const left = ((leg.startY - minY) / span) * 100;
      const width = ((Math.min(leg.endY, maxY) - leg.startY) / span) * 100;
      return `<div class="lane">
      <div class="lbl">${leg.startLabel} · ${leg.mat}a</div>
      <div class="track"><div class="bar" style="left:${left}%;width:${width}%">${leg.rate}%</div></div>
    </div>`;
    })
    .join("");
  const tickYears: number[] = [];
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) tickYears.push(y);
  return `
    <div class="laddertitle">Cronologie emisiuni & maturități</div>
    <div class="ladder">${lanes}</div>
    <div class="axis"><div></div><div class="ticks">${tickYears
      .map((y) => `<span>${y}</span>`)
      .join("")}</div></div>`;
}

function detailHTML(allLegs: Leg[]): string {
  const rows = allLegs
    .map(
      (leg) => `<tr>
      <td>${leg.startLabel}</td>
      <td>${leg.mat} ani</td>
      <td class="num">${leg.rate.toFixed(2)}%</td>
      <td class="num">${fmt(leg.principal)}</td>
      <td class="num">${fmt(leg.couponAnnual)}</td>
      <td class="num">${leg.matured ? "scadent" : "în curs"}</td>
    </tr>`,
    )
    .join("");
  return `
    <div class="laddertitle">Detaliu pe tranșe</div>
    <table class="detail">
      <thead><tr><th>Emisiune</th><th>Scad.</th><th>Dobândă</th><th>Principal</th><th>Cupon/an</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** The coupon & principal payment calendar, grouped by calendar year. */
function calendarHTML(events: CashEvent[]): string {
  if (events.length === 0) return "";
  const body = scheduleByYear(events)
    .map((bucket) => {
      const rows = bucket.events
        .map(
          (e) => `<tr>
      <td>${fmtMonthYear(e.t)}</td>
      <td>${e.legLabel}</td>
      <td>${e.kind === "coupon" ? "Cupon" : "Principal"}</td>
      <td class="num">${fmt(e.amount)}</td>
      <td class="num">${e.reinvested ? "reinvestit" : "încasat"}</td>
    </tr>`,
        )
        .join("");
      return `<tr class="cal-year"><td colspan="3">${bucket.year}</td><td class="num">${fmt(bucket.total)}</td><td></td></tr>${rows}`;
    })
    .join("");
  return `
    <div class="laddertitle">Calendarul încasărilor — când și cât primești</div>
    <table class="detail">
      <thead><tr><th>Data</th><th>Emisiune</th><th>Tip</th><th>Sumă</th><th>Destinație</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Run the simulation for the given params and paint the results. */
export function render(params: SimParams, els: RenderTargets): void {
  const cur = currencyOf(params);
  const res = run(params);
  // For a recurring plan the invested capital is the amount times the number of
  // contributions; the baseline and figures reflect the whole committed plan.
  const invested = params.amount * contributionMonths(params).length;
  const { finalValue, profit, cagr } = summarizeOf(params, res);

  const allLegs = res.blocks.flatMap((b) => b.legs);
  const points = trajectory(res);

  els.headline.innerHTML = headlineHTML(finalValue, profit, cagr, cur);
  els.chart.innerHTML = growthChartHTML(points, invested, cur);
  els.bench.innerHTML = benchmarkSectionHTML(
    points,
    depositTrajectory(params),
    deflate(points, cur),
    invested,
    benchmarkSummary(params, points),
    cur,
  );
  els.viz.innerHTML = vizHTML(allLegs, params.startId);
  els.detail.innerHTML = detailHTML(allLegs);
  els.calendar.innerHTML = calendarHTML(couponSchedule(res, params));
}
