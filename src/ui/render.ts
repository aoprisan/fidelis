import { benchmarkSummary, deflate, depositTrajectory } from "../sim/benchmark";
import { couponSchedule, scheduleByYear, type CashEvent } from "../sim/cashflow";
import { idToYear } from "../sim/history";
import { planBenchmark } from "../sim/planBenchmark";
import { DONOR_MIN, plan, type PlanParams } from "../sim/planner";
import {
  contributionMonths,
  run,
  runHorizon,
  summarizeOf,
  trajectory,
  type Leg,
  type SimParams,
  type ValuePoint,
} from "../sim/simulate";
import { benchmarkSectionHTML, forwardBenchmarkSectionHTML } from "./benchmark";
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

/** Currency code → the banknote-denomination word on the certificate face. */
const ccyWord = (ccy: string): string => (ccy === "EUR" ? "euro" : "lei");

/** A section heading with a trailing dashed rule. */
const sectionTitle = (label: string): string => `<div class="section-title">${label}</div>`;

/** A decimal year to a `MMM YYYY`-ish label (month resolved from the fraction). */
function yearLabel(y: number): string {
  const year = Math.floor(y + 1e-9);
  const month = Math.round((y - year) * 12); // 0-based
  const names = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = ((month % 12) + 12) % 12;
  return `${names[mi]} ${year + Math.floor(month / 12)}`;
}

// ── the certificate face ─────────────────────────────────────────────────────

function certHTML(
  finalValue: number,
  profit: number,
  cagr: number,
  years: number,
  ccy: string,
  valueLabel: string,
  rateLabel: string,
): string {
  const profitCls = profit >= 0 ? "pos" : "neg";
  const sign = profit >= 0 ? "+" : "−";
  const w = ccyWord(ccy);
  return `
    <div class="cert__flag">
      <span class="micro">${valueLabel}</span>
      <span class="cert__free">Cupon neimpozabil</span>
    </div>
    <div class="denom stamp-in">
      <span class="denom__num">${fmt(finalValue)}</span>
      <span class="denom__ccy">${w}</span>
    </div>
    <div class="cert__supp">
      <div class="supp">
        <span class="supp__k">Câștig net</span>
        <span class="supp__v ${profitCls}">${sign}${fmt(Math.abs(profit))} ${w}</span>
      </div>
      <div class="supp">
        <span class="supp__k">${rateLabel}</span>
        <span class="supp__v">${fmt2(cagr)}%</span>
      </div>
      <div class="supp">
        <span class="supp__k">Perioadă</span>
        <span class="supp__v">${fmt2(years)} ani</span>
      </div>
    </div>`;
}

// ── detachable interest coupons (shared signature element) ───────────────────

interface Coupon {
  no: string;
  period: string;
  rate: number;
  mat: number;
  couponAnnual: number;
  matured: boolean;
  donor?: boolean;
}

function couponHTML(c: Coupon): string {
  const cls =
    "coupon" + (c.donor ? " coupon--donor" : "") + (c.matured ? " coupon--matured" : "");
  const stamp = c.matured ? `<span class="coupon__stamp">încasat</span>` : "";
  return `
    <div class="${cls}">
      <div class="coupon__stub"><span>Cupon ${c.no}</span></div>
      <div class="coupon__face">
        <div class="coupon__period">${c.period}</div>
        <div class="coupon__rate">${fmt2(c.rate)}%</div>
        <div class="coupon__mat">${c.mat} ani${c.donor ? " · donator" : ""}</div>
        <div class="coupon__foot">
          <span class="coupon__k">Cupon / an</span>
          <span class="coupon__val">${fmt(c.couponAnnual)}</span>
        </div>
      </div>
      ${stamp}
    </div>`;
}

const couponStripHTML = (title: string, coupons: Coupon[]): string =>
  sectionTitle(title) + `<div class="coupons">${coupons.map(couponHTML).join("")}</div>`;

/** Value-over-time growth chart as a self-contained, responsive inline SVG. */
function growthChartHTML(points: ValuePoint[], invested: number, valueTag: string): string {
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
  const tagW = 104;
  const tagX = Math.min(ex + 10, px1 - tagW);
  const endTag = `
    <line x1="${ex}" y1="${ey}" x2="${ex}" y2="${py1}" class="gc-drop" />
    <g class="gc-tag" transform="translate(${round(tagX)}, ${round(Math.max(ey - 30, py0))})">
      <rect width="${tagW}" height="34" rx="3" />
      <text x="9" y="14" class="gc-tagk">${valueTag}</text>
      <text x="9" y="28" class="gc-tagv">${fmt(last.value)}</text>
    </g>
    <circle cx="${ex}" cy="${ey}" r="4" class="gc-end" />`;

  return `
    <div class="laddertitle">Evoluția valorii în timp</div>
    <div class="growthchart">
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="Grafic al evoluției valorii investiției de la ${fmt(invested)} la ${fmt(last.value)}">
        <defs>
          <linearGradient id="gcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(44,97,70,0.30)" />
            <stop offset="100%" stop-color="rgba(44,97,70,0.02)" />
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

/** The signature: each leg rendered as a detachable interest coupon. */
function vizHTML(allLegs: Leg[]): string {
  const coupons: Coupon[] = allLegs.map((leg, i) => ({
    no: String(i + 1).padStart(2, "0"),
    period: `${leg.startLabel} → ${Math.round(leg.endY)}`,
    rate: leg.rate,
    mat: leg.mat,
    couponAnnual: leg.couponAnnual,
    matured: leg.matured,
  }));
  return couponStripHTML("Cupoane · cronologie emisiuni", coupons);
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
    ${sectionTitle("Detaliu pe tranșe")}
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
    ${sectionTitle("Calendarul încasărilor — când și cât primești")}
    <table class="detail">
      <thead><tr><th>Data</th><th>Emisiune</th><th>Tip</th><th>Sumă</th><th>Destinație</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Run the simulation for the given params and paint the results. */
export function render(params: SimParams, els: RenderTargets): void {
  const res = run(params);
  // For a recurring plan the invested capital is the amount times the number of
  // contributions; the baseline and figures reflect the whole committed plan.
  const invested = params.amount * contributionMonths(params).length;
  const { finalValue, profit, cagr, years } = summarizeOf(params, res);

  const toMaturity = params.horizon === "maturity";
  const valueLabel = toMaturity ? "Valoare la scadență" : "Valoare azi";
  const valueTag = toMaturity ? "LA SCADENȚĂ" : "VALOARE AZI";
  const rateLabel = contributionMonths(params).length > 1 ? "Randament (IRR)" : "Randament p.a.";

  const allLegs = res.blocks.flatMap((b) => b.legs);
  const points = trajectory(res, runHorizon(params, res));

  els.headline.innerHTML = certHTML(finalValue, profit, cagr, years, params.currency, valueLabel, rateLabel);
  els.chart.innerHTML = growthChartHTML(points, invested, valueTag);
  // The deposit/inflation benchmark is denominated in RON (BNR deposit rates,
  // INS CPI) and only extends to the program horizon — it is meaningless for a
  // EUR tranche or a hold-to-maturity run that runs past the macro data.
  els.bench.innerHTML =
    params.currency === "EUR" || toMaturity
      ? ""
      : benchmarkSectionHTML(
          points,
          depositTrajectory(params),
          deflate(points),
          invested,
          benchmarkSummary(params, points),
        );
  els.viz.innerHTML = vizHTML(allLegs);
  els.detail.innerHTML = detailHTML(allLegs);
  els.calendar.innerHTML = calendarHTML(couponSchedule(res, params));
}

// ── forward-looking ladder planner ───────────────────────────────────────────

function planCertHTML(r: ReturnType<typeof plan>, ccy: string): string {
  const profitCls = r.profit >= 0 ? "pos" : "neg";
  const sign = r.profit >= 0 ? "+" : "−";
  const w = ccyWord(ccy);
  return `
    <div class="cert__flag">
      <span class="micro">Valoare la orizont</span>
      <span class="cert__free">Cupon neimpozabil</span>
    </div>
    <div class="denom stamp-in">
      <span class="denom__num">${fmt(r.finalValue)}</span>
      <span class="denom__ccy">${w}</span>
    </div>
    <div class="cert__supp">
      <div class="supp">
        <span class="supp__k">Câștig net</span>
        <span class="supp__v ${profitCls}">${sign}${fmt(Math.abs(r.profit))} ${w}</span>
      </div>
      <div class="supp">
        <span class="supp__k">Randament (IRR)</span>
        <span class="supp__v">${fmt2(r.cagr)}%</span>
      </div>
      <div class="supp">
        <span class="supp__k">Orizont</span>
        <span class="supp__v">${fmt2(r.years)} ani</span>
      </div>
    </div>`;
}

function planCalloutHTML(r: ReturnType<typeof plan>, ccy: string): string {
  const w = ccyWord(ccy);
  const bits: string[] = [];
  bits.push(
    `Contribuit total: <b>${fmt(r.contributed)} ${w}</b> pe ${fmt2(r.years)} ani, în ${r.purchases.length} tranșe.`,
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

/** The capital-return schedule as marks on an engraved calendar axis. */
function returnsCalendarHTML(
  schedule: ReturnType<typeof plan>["schedule"],
  minY: number,
  maxY: number,
  ccy: string,
): string {
  const span = maxY - minY || 1;
  const marks = schedule
    .map((e) => {
      const left = ((e.year - minY) / span) * 100;
      const cls = e.kind === "principal" ? "cal-mark cal-mark--principal" : "cal-mark cal-mark--coupon";
      const kind = e.kind === "principal" ? "capital" : "cupon";
      return `<div class="${cls}" style="left:${left}%" title="${kind} +${fmt(e.amount)} ${ccy}"></div>`;
    })
    .join("");
  const ticks: number[] = [];
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) ticks.push(y);
  return `
    ${sectionTitle("Calendar retururi de capital")}
    <div class="calendar">
      <div class="cal-axis">${marks}</div>
      <div class="cal-ticks">${ticks.map((y) => `<span>${y}</span>`).join("")}</div>
      <div class="cal-legend">
        <span><span class="cal-dot cal-dot--coupon"></span>cupon anual</span>
        <span><span class="cal-dot cal-dot--principal"></span>capital la scadență</span>
      </div>
    </div>`;
}

function planVizHTML(r: ReturnType<typeof plan>, p: PlanParams): string {
  const minY = idToYear(p.startId);
  const maxY = minY + r.years;
  const coupons: Coupon[] = r.purchases.map((b, i) => ({
    no: String(i + 1).padStart(2, "0"),
    period: `${b.buyLabel} → ${Math.round(b.maturesYear)}`,
    rate: b.rate,
    mat: b.mat,
    couponAnnual: Math.round((b.amount * b.rate) / 100),
    matured: b.maturesYear <= maxY + 1e-9,
    donor: b.donor,
  }));
  return (
    planCalloutHTML(r, p.currency) +
    couponStripHTML("Cupoane · plan de achiziții (o tranșă / lună)", coupons) +
    returnsCalendarHTML(r.schedule, minY, maxY, p.currency)
  );
}

function planDetailHTML(r: ReturnType<typeof plan>): string {
  const buys = r.purchases
    .map(
      (b) => `<tr>
      <td>${b.buyLabel}</td>
      <td>${b.mat} ani${b.donor ? " · donator" : ""}</td>
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
    ${sectionTitle("Ce cumperi în fiecare lună")}
    <table class="detail">
      <thead><tr><th>Emisiune</th><th>Scad.</th><th>Dobândă</th><th>Sumă</th><th>Interval</th></tr></thead>
      <tbody>${buys}</tbody>
    </table>
    ${sectionTitle("Jurnal retururi de capital")}
    <table class="detail">
      <thead><tr><th>Când</th><th>Tip</th><th>Sumă</th><th>Din emisiunea</th><th>Destinație</th></tr></thead>
      <tbody>${events || `<tr><td colspan="5">Niciun retur în orizontul ales.</td></tr>`}</tbody>
    </table>`;
}

/** Run the ladder planner for the given params and paint the results. */
export function renderPlan(params: PlanParams, els: RenderTargets): void {
  const r = plan(params);
  els.headline.innerHTML = planCertHTML(r, params.currency);
  els.chart.innerHTML = "";
  // The deposit/inflation benchmark is denominated in RON (BNR deposit rates,
  // INS CPI), so it is meaningless for a EUR ladder.
  els.bench.innerHTML =
    params.currency === "EUR"
      ? ""
      : forwardBenchmarkSectionHTML(r.finalValue, r.contributed, r.cagr, planBenchmark(params, r));
  els.viz.innerHTML = planVizHTML(r, params);
  els.detail.innerHTML = planDetailHTML(r);
  els.calendar.innerHTML = "";
}
