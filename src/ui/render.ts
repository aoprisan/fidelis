import { idToYear } from "../sim/history";
import { DONOR_MIN, plan, type PlanParams } from "../sim/planner";
import { horizonOf, run, summarize, type Leg, type SimParams } from "../sim/simulate";
import { fmt, fmt2 } from "./format";

/** DOM targets the render layer writes into. */
export interface RenderTargets {
  headline: HTMLElement;
  viz: HTMLElement;
  detail: HTMLElement;
}

/** One bar on the shared timeline component. */
interface TimelineBar {
  label: string;
  startY: number;
  endY: number;
  text: string;
  /** Visual tone; "donor" highlights the blood-donor tranche. */
  tone?: "donor";
}

/**
 * The shared timeline component: a lane per bar over the [minY, maxY] window,
 * plus a year axis. Used by both the backtester and the ladder planner.
 */
function timelineHTML(
  title: string,
  bars: TimelineBar[],
  minY: number,
  maxY: number,
  extra = "",
): string {
  const span = maxY - minY || 1;
  const lanes = bars
    .map((b) => {
      const left = ((b.startY - minY) / span) * 100;
      const width = Math.max(0, ((Math.min(b.endY, maxY) - b.startY) / span) * 100);
      const cls = b.tone === "donor" ? "bar donor" : "bar";
      return `<div class="lane">
      <div class="lbl">${b.label}</div>
      <div class="track"><div class="${cls}" style="left:${left}%;width:${width}%">${b.text}</div></div>
    </div>`;
    })
    .join("");
  const tickYears: number[] = [];
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) tickYears.push(y);
  return `
    <div class="laddertitle">${title}</div>
    <div class="ladder">${lanes}</div>
    <div class="axis"><div></div><div class="ticks">${tickYears
      .map((y) => `<span>${y}</span>`)
      .join("")}</div></div>${extra}`;
}

function headlineHTML(
  finalValue: number,
  profit: number,
  cagr: number,
  ccy: string,
): string {
  return `
    <div class="stat"><div class="k">Valoare la scadență</div><div class="v gold num">${fmt(finalValue)} ${ccy}</div></div>
    <div class="stat"><div class="k">Câștig net (neimpozabil)</div><div class="v pos num">+${fmt(profit)} ${ccy}</div></div>
    <div class="stat"><div class="k">Randament anualizat</div><div class="v num">${fmt2(cagr)}%</div></div>`;
}

function vizHTML(allLegs: Leg[], startId: string, maxY: number): string {
  const bars: TimelineBar[] = allLegs.map((leg) => ({
    label: `${leg.startLabel} · ${leg.mat}a`,
    startY: leg.startY,
    endY: leg.endY,
    text: `${leg.rate}%`,
  }));
  return timelineHTML("Cronologie emisiuni & maturități", bars, idToYear(startId), maxY);
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
  const { finalValue, profit, cagr } = summarize(params);
  const maxY = horizonOf(res);

  const allLegs = res.blocks.flatMap((b) => b.legs);

  els.headline.innerHTML = headlineHTML(finalValue, profit, cagr, params.currency);
  els.viz.innerHTML = vizHTML(allLegs, params.startId, maxY);
  els.detail.innerHTML = detailHTML(allLegs);
}

// ── Ladder planner ──────────────────────────────────────────────────────────

function planHeadlineHTML(r: ReturnType<typeof plan>, ccy: string): string {
  return `
    <div class="stat"><div class="k">Valoare la orizont</div><div class="v gold num">${fmt(r.finalValue)} ${ccy}</div></div>
    <div class="stat"><div class="k">Câștig net (neimpozabil)</div><div class="v pos num">+${fmt(r.profit)} ${ccy}</div></div>
    <div class="stat"><div class="k">Randament (IRR)</div><div class="v num">${fmt2(r.cagr)}%</div></div>`;
}

/** The capital-return schedule rendered as dots on the shared timeline axis. */
function returnsTrackHTML(
  schedule: ReturnType<typeof plan>["schedule"],
  minY: number,
  maxY: number,
  ccy: string,
): string {
  const span = maxY - minY || 1;
  const dots = schedule
    .map((e) => {
      const left = ((e.year - minY) / span) * 100;
      const cls = e.kind === "principal" ? "rmark principal" : "rmark coupon";
      const kind = e.kind === "principal" ? "capital" : "cupon";
      return `<div class="${cls}" style="left:${left}%" title="${kind} +${fmt(e.amount)} ${ccy}"></div>`;
    })
    .join("");
  return `
    <div class="laddertitle">Calendar retururi de capital</div>
    <div class="lane">
      <div class="lbl">Retururi</div>
      <div class="track rtrack">${dots}</div>
    </div>
    <div class="rlegend"><span class="rmark coupon"></span>cupon anual&nbsp;&nbsp;<span class="rmark principal"></span>capital la scadență</div>`;
}

function planCalloutHTML(r: ReturnType<typeof plan>): string {
  const bits: string[] = [];
  bits.push(
    `Contribuit total: <b>${fmt(r.contributed)} RON</b> pe ${fmt2(r.years)} ani, în ${r.purchases.length} tranșe.`,
  );
  if (r.donorUsedCount > 0)
    bits.push(
      `Tranșa donator a dominat în <b>${r.donorUsedCount}</b> ${
        r.donorUsedCount === 1 ? "lună" : "luni"
      } (avantaj mediu <b>+${fmt2(r.donorAvgEdge)} pp</b>).`,
    );
  else if (r.donorBlockedCount > 0)
    bits.push(
      `Tranșa donator ar fi fost mai bună în ${r.donorBlockedCount} luni, dar necesită minim <b>${DONOR_MIN} RON</b> per subscriere.`,
    );
  return `<div class="callout">${bits.join(" ")}</div>`;
}

function planVizHTML(r: ReturnType<typeof plan>, p: PlanParams): string {
  const minY = idToYear(p.startId);
  const maxY = minY + r.years;
  const bars: TimelineBar[] = r.purchases.map((b) => ({
    label: `${b.buyLabel} · ${b.mat}a${b.donor ? " ★" : ""}`,
    startY: b.year,
    endY: b.maturesYear,
    text: `${b.rate}%`,
    tone: b.donor ? "donor" : undefined,
  }));
  const returns = returnsTrackHTML(r.schedule, minY, maxY, p.currency);
  return (
    planCalloutHTML(r) +
    timelineHTML("Plan de achiziții (o tranșă / lună)", bars, minY, maxY, returns)
  );
}

function planDetailHTML(r: ReturnType<typeof plan>): string {
  const buys = r.purchases
    .map(
      (b) => `<tr>
      <td>${b.buyLabel}</td>
      <td>${b.mat} ani${b.donor ? " ★" : ""}</td>
      <td class="num">${b.rate.toFixed(2)}%</td>
      <td class="num">${fmt(b.amount)}</td>
      <td>${b.buyLabel} → ${yearLabel(b.maturesYear)}</td>
    </tr>`,
    )
    .join("");
  const events = r.schedule
    .map(
      (e) => `<tr>
      <td>${yearLabel(e.year)}</td>
      <td>${e.kind === "principal" ? "Capital" : "Cupon"}</td>
      <td class="num">+${fmt(e.amount)}</td>
      <td>${e.fromLabel}</td>
      <td>${e.reinvested ? "reinvestit" : "retras"}</td>
    </tr>`,
    )
    .join("");
  return `
    <div class="laddertitle">Ce cumperi în fiecare lună</div>
    <table class="detail">
      <thead><tr><th>Emisiune</th><th>Scad.</th><th>Dobândă</th><th>Sumă</th><th>Interval</th></tr></thead>
      <tbody>${buys}</tbody>
    </table>
    <div class="laddertitle">Calendar retururi de capital</div>
    <table class="detail">
      <thead><tr><th>Când</th><th>Tip</th><th>Sumă</th><th>Din emisiunea</th><th>Destinație</th></tr></thead>
      <tbody>${events || `<tr><td colspan="5">Niciun retur în orizontul ales.</td></tr>`}</tbody>
    </table>`;
}

/** A decimal year to a `MMM YYYY`-ish label (month resolved from the fraction). */
function yearLabel(y: number): string {
  const year = Math.floor(y + 1e-9);
  const month = Math.round((y - year) * 12); // 0-based
  const names = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = ((month % 12) + 12) % 12;
  return `${names[mi]} ${year + Math.floor(month / 12)}`;
}

/** Run the ladder planner for the given params and paint the results. */
export function renderPlan(params: PlanParams, els: RenderTargets): void {
  const r = plan(params);
  els.headline.innerHTML = planHeadlineHTML(r, params.currency);
  els.viz.innerHTML = planVizHTML(r, params);
  els.detail.innerHTML = planDetailHTML(r);
}
