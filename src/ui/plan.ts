/**
 * The Plan tab (`#view-plan`): a clean, forward-looking earnings model built on
 * the CURRENT Fidelis offer — the most recent edition. Two approaches share one
 * pure core (`sim/offer.ts`):
 *  - `single`: pick amount + currency + one tranche (a maturity, or the
 *    blood-donor tranche in RON);
 *  - `ladder`: pick currency + spread the amount across maturities by weight.
 *
 * Self-contained, like `ui/info.ts`: it owns its controls and paints its own
 * bond-certificate result into `#planResult`. It never touches the backtester /
 * rolling-planner app in `ui/app.ts`; it only reads the pure `sim/offer.ts`.
 * The inline-SVG growth chart copies the scaffold from `render.ts`, per the
 * codebase's copy-per-chart convention.
 */

import type { Currency } from "../data/history";
import {
  computeOffer,
  currentOffer,
  offerTranches,
  wealthCurve,
  type OfferMode,
  type OfferResult,
  type OfferTranche,
  type Rung,
} from "../sim/offer";
import { fmt, fmt2, fmtK, fmtMonthYear } from "./format";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const press = (buttons: Iterable<Element>, active: Element): void => {
  for (const b of buttons) b.setAttribute("aria-pressed", String(b === active));
};

const ccyWord = (ccy: Currency): string => (ccy === "EUR" ? "euro" : "lei");
const sectionTitle = (label: string): string => `<div class="section-title">${label}</div>`;

interface PlanState {
  currency: Currency;
  amount: number;
  mode: OfferMode;
  /** Chosen tranche key for `single`. */
  pick: string;
  /** Weight (%) per tranche key for `ladder`; normalised in the core. */
  weights: Record<string, number>;
}

/** Default weights: standard rungs split evenly, donor left out. */
function defaultWeights(tranches: OfferTranche[]): Record<string, number> {
  const std = tranches.filter((t) => !t.donor);
  const each = Math.round(100 / Math.max(std.length, 1));
  const w: Record<string, number> = {};
  for (const t of tranches) w[t.key] = t.donor ? 0 : each;
  return w;
}

export function initPlan(): void {
  const S: PlanState = {
    currency: "RON",
    amount: 50000,
    mode: "single",
    pick: "",
    weights: {},
  };

  const offer = currentOffer();

  // --- offer summary line ----------------------------------------------------

  function paintOfferLine() {
    const tranches = offerTranches(S.currency, offer);
    const top = Math.max(...tranches.map((t) => t.rate));
    el("poOfferLine").innerHTML =
      `Oferta curentă · <b>ediția ${offer.label}</b> · ` +
      `dobânzi ${ccyWord(S.currency) === "euro" ? "în euro" : "în lei"} până la <b>${fmt2(top)}%</b>, neimpozabile.`;
  }

  // --- currency --------------------------------------------------------------

  function bindCurrency() {
    el("poCcy")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => {
          S.currency = b.dataset.ccy as Currency;
          press(el("poCcy").children, b);
          resetForCurrency();
          paint();
        };
      });
  }

  /** Rebuild the tranche-dependent controls after a currency switch. */
  function resetForCurrency() {
    const tranches = offerTranches(S.currency, offer);
    S.pick = tranches[0].key;
    S.weights = defaultWeights(tranches);
    const w = ccyWord(S.currency);
    el("poAmountLabel").textContent = `Sumă investită (${w})`;
    buildPick(tranches);
    buildWeights(tranches);
    paintOfferLine();
  }

  // --- approach (single / ladder) -------------------------------------------

  function bindMode() {
    el("poMode")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => {
          S.mode = b.dataset.mode as OfferMode;
          press(el("poMode").children, b);
          applyMode();
          paint();
        };
      });
  }

  function applyMode() {
    const ladder = S.mode === "ladder";
    el("poSingle").hidden = ladder;
    el("poLadder").hidden = !ladder;
  }

  // --- single: tranche picker ------------------------------------------------

  function buildPick(tranches: OfferTranche[]) {
    const seg = el("poPick");
    seg.innerHTML = tranches
      .map(
        (t) =>
          `<button data-key="${t.key}" aria-pressed="${t.key === S.pick}" class="${
            t.donor ? "po-tranche--donor" : ""
          }"><span class="po-tranche__mat">${t.label}</span><span class="po-tranche__rate">${fmt2(
            t.rate,
          )}%</span></button>`,
      )
      .join("");
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        S.pick = b.dataset.key!;
        press(seg.children, b);
        paint();
      };
    });
  }

  // --- ladder: per-rung weights ----------------------------------------------

  function buildWeights(tranches: OfferTranche[]) {
    const box = el("poWeights");
    box.innerHTML = tranches
      .map(
        (t) => `
        <div class="po-weight${t.donor ? " po-weight--donor" : ""}">
          <span class="po-weight__lab">${t.label}<em>${fmt2(t.rate)}%</em></span>
          <div class="po-weight__in">
            <input type="number" data-key="${t.key}" value="${S.weights[t.key] ?? 0}" min="0" max="100" step="5" aria-label="Pondere ${t.label}" />
            <span class="po-weight__suf">%</span>
          </div>
          <span class="po-weight__eff" data-eff="${t.key}"></span>
        </div>`,
      )
      .join("");
    box.querySelectorAll<HTMLInputElement>("input").forEach((inp) => {
      inp.oninput = () => {
        S.weights[inp.dataset.key!] = Math.max(0, Number(inp.value) || 0);
        paint(); // re-values effective principals + result, leaves inputs intact
      };
    });

    el("poEqual").onclick = () => {
      S.weights = defaultWeights(tranches);
      box.querySelectorAll<HTMLInputElement>("input").forEach((inp) => {
        inp.value = String(S.weights[inp.dataset.key!] ?? 0);
      });
      paint();
    };
  }

  /** Update the "→ 20.000 lei" effective-principal readouts without rebuilding inputs. */
  function paintWeightEffects(res: OfferResult) {
    const w = ccyWord(S.currency);
    const byKey = new Map(res.rungs.map((r) => [r.key, r]));
    el("poWeights")
      .querySelectorAll<HTMLElement>("[data-eff]")
      .forEach((span) => {
        const r = byKey.get(span.dataset.eff!);
        span.textContent = r && r.principal > 0 ? `→ ${fmt(Math.round(r.principal))} ${w}` : "—";
      });
    const rungs = res.rungs.filter((r) => r.principal > 0).length;
    el("poWeightHint").textContent =
      rungs > 0
        ? `Randament mediu ponderat ${fmt2(res.avgCoupon)}% · ${rungs} ${rungs === 1 ? "tranșă" : "tranșe"}.`
        : "";
  }

  // --- amount ----------------------------------------------------------------

  el<HTMLInputElement>("poAmount").oninput = (e) => {
    S.amount = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
    paint();
  };

  // --- render ----------------------------------------------------------------

  function paint() {
    const res = computeOffer({
      currency: S.currency,
      amount: S.amount,
      mode: S.mode,
      pick: S.pick,
      weights: S.weights,
    });
    if (S.mode === "ladder") paintWeightEffects(res);
    el("planResult").innerHTML = resultHTML(res, S.mode);
  }

  // --- wire up ---------------------------------------------------------------

  bindCurrency();
  bindMode();
  resetForCurrency();
  applyMode();
  paint();
}

// ── result painters ──────────────────────────────────────────────────────────

function resultHTML(res: OfferResult, mode: OfferMode): string {
  return (
    certHTML(res) +
    growthChartHTML(res) +
    couponStripHTML(res, mode) +
    calendarHTML(res) +
    detailHTML(res, mode)
  );
}

/** The certificate face — the headline the whole plan reduces to. */
function certHTML(res: OfferResult): string {
  const w = ccyWord(res.currency);
  const notes: string[] = [];
  const below = res.rungs.filter((r) => r.belowMin);
  if (below.length) {
    notes.push(
      `Sub pragul minim uzual la ${below.length === 1 ? "tranșa" : "tranșele"} ${below
        .map((r) => r.label.toLowerCase())
        .join(", ")}.`,
    );
  }
  if (res.rungs.some((r) => r.donor)) {
    notes.push("Include tranșa pentru donatori de sânge (prag minim redus, 500 lei).");
  }
  const note = notes.length ? `<p class="plan-note">${notes.join(" ")}</p>` : "";

  return `
    <div class="cert" id="planCert">
      <div class="cert__flag">
        <span class="micro">Total încasat la scadență</span>
        <span class="cert__free">Cupon neimpozabil</span>
      </div>
      <div class="denom stamp-in">
        <span class="denom__num">${fmt(Math.round(res.finalValue))}</span>
        <span class="denom__ccy">${w}</span>
      </div>
      <div class="cert__supp">
        <div class="supp">
          <span class="supp__k">Dobânzi totale</span>
          <span class="supp__v pos">+${fmt(Math.round(res.totalInterest))} ${w}</span>
        </div>
        <div class="supp">
          <span class="supp__k">Randament (IRR)</span>
          <span class="supp__v">${fmt2(res.yieldPct)}%</span>
        </div>
        <div class="supp">
          <span class="supp__k">Orizont</span>
          <span class="supp__v">${res.horizonYears} ani</span>
        </div>
      </div>
      <p class="plan-invested">Investești <b>${fmt(Math.round(res.invested))} ${w}</b> azi, în ediția ${res.offerLabel}.</p>
      ${note}
    </div>`;
}

/** Each rung rendered as a detachable interest coupon. */
function couponStripHTML(res: OfferResult, mode: OfferMode): string {
  const title = mode === "ladder" ? "Cupoane · tranșele scării" : "Cuponul tău";
  const cards = res.rungs
    .filter((r) => r.principal > 0)
    .map((r, i) => {
      const cls = "coupon" + (r.donor ? " coupon--donor" : "");
      return `
      <div class="${cls}">
        <div class="coupon__stub"><span>Cupon ${String(i + 1).padStart(2, "0")}</span></div>
        <div class="coupon__face">
          <div class="coupon__period">${fmtMonthYear(res.offerYear)} → ${Math.floor(res.offerYear + r.mat)}</div>
          <div class="coupon__rate">${fmt2(r.rate)}%</div>
          <div class="coupon__mat">${r.mat} ani${r.donor ? " · donator" : ""}</div>
          <div class="coupon__foot">
            <span class="coupon__k">Cupon / an</span>
            <span class="coupon__val">${fmt(Math.round(r.annualCoupon))}</span>
          </div>
        </div>
      </div>`;
    })
    .join("");
  return sectionTitle(title) + `<div class="coupons">${cards}</div>`;
}

/** The coupon & principal calendar, grouped by calendar year. */
function calendarHTML(res: OfferResult): string {
  if (res.flows.length === 0) return "";
  // Bucket flows by whole calendar year.
  const buckets = new Map<number, { total: number; rows: string[] }>();
  for (const f of res.flows) {
    const yr = Math.floor(f.year + 1e-9);
    const b = buckets.get(yr) ?? { total: 0, rows: [] };
    b.total += f.amount;
    b.rows.push(`<tr>
      <td>${fmtMonthYear(f.year)}</td>
      <td>${f.mat} ani${res.rungs.find((r) => r.key === f.fromKey)?.donor ? " · donator" : ""}</td>
      <td>${f.kind === "coupon" ? "Cupon" : "Principal"}</td>
      <td class="num">${fmt(Math.round(f.amount))}</td>
    </tr>`);
    buckets.set(yr, b);
  }
  const body = [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((yr) => {
      const b = buckets.get(yr)!;
      return `<tr class="cal-year"><td colspan="3">${yr}</td><td class="num">${fmt(
        Math.round(b.total),
      )}</td></tr>${b.rows.join("")}`;
    })
    .join("");
  return `
    ${sectionTitle("Calendarul încasărilor — când și cât primești")}
    <table class="detail">
      <thead><tr><th>Data</th><th>Tranșă</th><th>Tip</th><th>Sumă</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Per-rung breakdown. */
function detailHTML(res: OfferResult, mode: OfferMode): string {
  const w = ccyWord(res.currency);
  const rows = res.rungs
    .filter((r) => r.principal > 0)
    .map(
      (r: Rung) => `<tr>
      <td>${r.label}</td>
      <td class="num">${fmt2(r.rate)}%</td>
      ${mode === "ladder" ? `<td class="num">${fmt2(r.weightPct)}%</td>` : ""}
      <td class="num">${fmt(Math.round(r.principal))}</td>
      <td class="num">${fmt(Math.round(r.annualCoupon))}</td>
      <td class="num">${fmt(Math.round(r.totalInterest))}</td>
      <td class="num">${fmt(Math.round(r.maturityValue))}</td>
    </tr>`,
    )
    .join("");
  const weightHead = mode === "ladder" ? "<th>Pondere</th>" : "";
  return `
    ${sectionTitle("Detaliu pe tranșe")}
    <table class="detail">
      <thead><tr><th>Tranșă</th><th>Dobândă</th>${weightHead}<th>Principal (${w})</th><th>Cupon/an</th><th>Dobânzi total</th><th>La scadență</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Wealth-over-time growth chart as a self-contained, responsive inline SVG. */
function growthChartHTML(res: OfferResult): string {
  const points = wealthCurve(res);
  if (points.length < 2) return "";

  const W = 720;
  const H = 250;
  const m = { top: 18, right: 18, bottom: 26, left: 54 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const invested = res.invested;
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
        `<text x="${xx}" y="${py1 + 16}" class="gc-xlab" text-anchor="middle">+${yr}</text>`,
    );
  }

  const byBase = round(sy(invested));
  const baseline =
    byBase >= py0 && byBase <= py1
      ? `<line x1="${px0}" y1="${byBase}" x2="${px1}" y2="${byBase}" class="gc-base" />
         <text x="${px1}" y="${byBase - 6}" text-anchor="end" class="gc-baselab">Investit · ${fmtK(invested)}</text>`
      : "";

  const last = points[points.length - 1];
  const ex = round(sx(last.t));
  const ey = round(sy(last.value));
  const tagW = 104;
  const tagX = Math.min(ex + 10, px1 - tagW);
  const endTag = `
    <line x1="${ex}" y1="${ey}" x2="${ex}" y2="${py1}" class="gc-drop" />
    <g class="gc-tag" transform="translate(${round(tagX)}, ${round(Math.max(ey - 30, py0))})">
      <rect width="${tagW}" height="34" rx="3" />
      <text x="9" y="14" class="gc-tagk">La scadență</text>
      <text x="9" y="28" class="gc-tagv">${fmt(Math.round(last.value))}</text>
    </g>
    <circle cx="${ex}" cy="${ey}" r="4" class="gc-end" />`;

  return `
    <div class="laddertitle">Averea în timp — capitalul plus cupoanele încasate</div>
    <div class="growthchart">
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="Grafic al averii în timp de la ${fmt(Math.round(invested))} la ${fmt(Math.round(last.value))}">
        <defs>
          <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(44,97,70,0.30)" />
            <stop offset="100%" stop-color="rgba(44,97,70,0.02)" />
          </linearGradient>
        </defs>
        ${grid.join("")}
        ${xTicks.join("")}
        <path d="${area}" fill="url(#pcFill)" />
        <path d="${line}" class="gc-line" />
        ${baseline}
        ${endTag}
        ${yLabels.join("")}
      </svg>
    </div>`;
}
