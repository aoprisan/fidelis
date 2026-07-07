import { idToYear } from "../sim/history";
import { DONOR_MIN, plan, type PlanParams } from "../sim/planner";
import { run, summarize, type Leg, type SimParams } from "../sim/simulate";
import { fmt, fmt2 } from "./format";

/** DOM targets the render layer writes into. */
export interface RenderTargets {
  headline: HTMLElement;
  viz: HTMLElement;
  detail: HTMLElement;
}

/** Currency code → the banknote-denomination word used on the certificate face. */
const ccyWord = (ccy: string): string => (ccy === "EUR" ? "euro" : "lei");

/** A section title with a trailing dashed rule (the register/coupon headings). */
const sectionTitle = (label: string): string =>
  `<div class="section-title">${label}</div>`;

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
  value: number,
  profit: number,
  cagr: number,
  years: number,
  ccy: string,
): string {
  const profitCls = profit >= 0 ? "pos" : "neg";
  const sign = profit >= 0 ? "+" : "−";
  return `
    <div class="cert__flag">
      <span class="micro">Valoare la scadență</span>
      <span class="cert__free">Cupon neimpozabil</span>
    </div>
    <div class="denom stamp-in">
      <span class="denom__num">${fmt(value)}</span>
      <span class="denom__ccy">${ccyWord(ccy)}</span>
    </div>
    <div class="cert__supp">
      <div class="supp">
        <span class="supp__k">Câștig net</span>
        <span class="supp__v ${profitCls}">${sign}${fmt(Math.abs(profit))} ${ccyWord(ccy)}</span>
      </div>
      <div class="supp">
        <span class="supp__k">Randament p.a.</span>
        <span class="supp__v">${fmt2(cagr)}%</span>
      </div>
      <div class="supp">
        <span class="supp__k">Perioadă</span>
        <span class="supp__v">${fmt2(years)} ani</span>
      </div>
    </div>`;
}

// ── the coupon strip (signature) ─────────────────────────────────────────────

/** One detachable interest coupon on the strip. */
interface Coupon {
  /** Sequence label shown on the tear-off stub. */
  no: string;
  /** Issue → maturity period, e.g. "Feb 2025 → 2030". */
  period: string;
  /** Annual coupon rate, %. */
  rate: number;
  /** Maturity in years. */
  mat: number;
  /** Annual coupon value in the tranche currency. */
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

function couponStripHTML(title: string, coupons: Coupon[]): string {
  return sectionTitle(title) + `<div class="coupons">${coupons.map(couponHTML).join("")}</div>`;
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
      <td>${leg.matured ? "scadent" : "în curs"}</td>
    </tr>`,
    )
    .join("");
  return `
    ${sectionTitle("Registrul emisiunilor")}
    <table class="detail">
      <thead><tr><th>Emisiune</th><th>Scad.</th><th>Dobândă</th><th>Principal</th><th>Cupon/an</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Run the simulation for the given params and paint the results. */
export function render(params: SimParams, els: RenderTargets): void {
  const res = run(params);
  const { finalValue, profit, cagr, years } = summarize(params);

  const allLegs = res.blocks.flatMap((b) => b.legs);
  const coupons: Coupon[] = allLegs.map((leg, i) => ({
    no: String(i + 1).padStart(2, "0"),
    period: `${leg.startLabel} → ${Math.round(leg.endY)}`,
    rate: leg.rate,
    mat: leg.mat,
    couponAnnual: leg.couponAnnual,
    matured: leg.matured,
  }));

  els.headline.innerHTML = certHTML(finalValue, profit, cagr, years, params.currency);
  els.viz.innerHTML = couponStripHTML("Cupoane · cronologie emisiuni", coupons);
  els.detail.innerHTML = detailHTML(allLegs);
}

// ── Ladder planner ──────────────────────────────────────────────────────────

function planCertHTML(r: ReturnType<typeof plan>, ccy: string): string {
  const profitCls = r.profit >= 0 ? "pos" : "neg";
  const sign = r.profit >= 0 ? "+" : "−";
  return `
    <div class="cert__flag">
      <span class="micro">Valoare la orizont</span>
      <span class="cert__free">Cupon neimpozabil</span>
    </div>
    <div class="denom stamp-in">
      <span class="denom__num">${fmt(r.finalValue)}</span>
      <span class="denom__ccy">${ccyWord(ccy)}</span>
    </div>
    <div class="cert__supp">
      <div class="supp">
        <span class="supp__k">Câștig net</span>
        <span class="supp__v ${profitCls}">${sign}${fmt(Math.abs(r.profit))} ${ccyWord(ccy)}</span>
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

/** The capital-return schedule as marks on an engraved calendar axis. */
function calendarHTML(
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
    planCalloutHTML(r) +
    couponStripHTML("Cupoane · plan de achiziții (o tranșă / lună)", coupons) +
    calendarHTML(r.schedule, minY, maxY, p.currency)
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
  els.viz.innerHTML = planVizHTML(r, params);
  els.detail.innerHTML = planDetailHTML(r);
}
