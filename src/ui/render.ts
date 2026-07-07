import { END } from "../data/history";
import { idToYear } from "../sim/history";
import { finalValueOf, run, type Leg, type SimParams } from "../sim/simulate";
import { fmt, fmt2 } from "./format";

/** DOM targets the render layer writes into. */
export interface RenderTargets {
  headline: HTMLElement;
  viz: HTMLElement;
  detail: HTMLElement;
}

function headlineHTML(finalValue: number, profit: number, cagr: number): string {
  return `
    <div class="stat"><div class="k">Valoare azi</div><div class="v gold num">${fmt(finalValue)} RON</div></div>
    <div class="stat"><div class="k">Câștig net (neimpozabil)</div><div class="v pos num">+${fmt(profit)} RON</div></div>
    <div class="stat"><div class="k">Randament anualizat</div><div class="v num">${fmt2(cagr)}%</div></div>`;
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

/** Run the simulation for the given params and paint the results. */
export function render(params: SimParams, els: RenderTargets): void {
  const res = run(params);
  const invested = params.amount;
  const finalValue = finalValueOf(res);
  const profit = finalValue - invested;
  const years = END - idToYear(params.startId);
  const cagr = years > 0 ? (Math.pow(finalValue / invested, 1 / years) - 1) * 100 : 0;

  const allLegs = res.blocks.flatMap((b) => b.legs);

  els.headline.innerHTML = headlineHTML(finalValue, profit, cagr);
  els.viz.innerHTML = vizHTML(allLegs, params.startId);
  els.detail.innerHTML = detailHTML(allLegs);
}
