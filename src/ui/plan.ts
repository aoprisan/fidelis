/**
 * The Plan tab (`#view-plan`): a clean Fidelis earnings model over the current
 * OR any past edition, contributed once or monthly, as a single tranche or a
 * weighted ladder, valued to maturity or as of today. A thin projection of the
 * pure `sim/offer.ts` engine — it owns its controls and paints its own
 * bond-certificate result, the way `ui/info.ts` owns the Info tab. It never
 * touches the Advanced backtester / rolling planner.
 *
 * The inline-SVG growth chart copies the scaffold from `render.ts`, per the
 * codebase's copy-per-chart convention.
 */

import { FIRST_SELECTABLE, HISTORY, type Currency } from "../data/history";
import {
  computeOffer,
  currentOffer,
  editionRungs,
  slotLabel,
  wealthCurve,
  type Alloc,
  type OfferContrib,
  type OfferHorizon,
  type OfferMode,
  type OfferResult,
  type Slot,
} from "../sim/offer";
import { offerBenchmark } from "../sim/offerBenchmark";
import { forwardBenchmarkSectionHTML } from "./benchmark";
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

/** Editions offered as a start point, newest first (the newest is "now"). */
const STARTS = HISTORY.filter((h) => h.id >= FIRST_SELECTABLE).slice().reverse();

interface PlanState {
  currency: Currency;
  startId: string;
  amount: number;
  contrib: OfferContrib;
  horizon: OfferHorizon;
  mode: OfferMode;
  pick: Slot;
  weights: Partial<Record<Slot, number>>;
}

/** Current offer → look forward to maturity; a past edition → mark to today. */
const defaultHorizon = (startId: string): OfferHorizon =>
  startId === currentOffer().id ? "maturity" : "now";

/** Default ladder weights: standard rungs even, donor left out. */
function defaultWeights(startId: string, ccy: Currency): Partial<Record<Slot, number>> {
  const std = editionRungs(startId, ccy).filter((r) => !r.donor);
  const each = Math.round(100 / Math.max(std.length, 1));
  const w: Partial<Record<Slot, number>> = {};
  for (const r of std) w[r.slot] = each;
  return w;
}

export function initPlan(): void {
  const S: PlanState = {
    currency: "RON",
    startId: currentOffer().id,
    amount: 50000,
    contrib: "once",
    horizon: "maturity",
    mode: "single",
    pick: "long",
    weights: {},
  };

  // --- currency --------------------------------------------------------------

  function bindCurrency() {
    el("poCcy")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => {
          S.currency = b.dataset.ccy as Currency;
          press(el("poCcy").children, b);
          resetForEdition();
          paint();
        };
      });
  }

  // --- start edition ---------------------------------------------------------

  function buildStart() {
    const seg = el("poStart");
    seg.innerHTML = STARTS.map((h, i) => {
      const tag = i === 0 ? " · acum" : "";
      return `<button data-id="${h.id}" aria-pressed="${h.id === S.startId}">${h.label}${tag}</button>`;
    }).join("");
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        S.startId = b.dataset.id!;
        S.horizon = defaultHorizon(S.startId);
        press(seg.children, b);
        syncHorizon();
        resetForEdition();
        paint();
      };
    });
  }

  /** Rebuild the tranche-dependent controls after a currency/edition switch. */
  function resetForEdition() {
    const rungs = editionRungs(S.startId, S.currency);
    if (!rungs.some((r) => r.slot === S.pick)) S.pick = "long";
    S.weights = defaultWeights(S.startId, S.currency);
    buildPick();
    buildWeights();
    relabelAmount();
  }

  // --- contribution (once / monthly) ----------------------------------------

  function bindContrib() {
    el("poContrib")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => {
          S.contrib = b.dataset.contrib as OfferContrib;
          press(el("poContrib").children, b);
          relabelAmount();
          paint();
        };
      });
  }

  function relabelAmount() {
    const w = ccyWord(S.currency);
    el("poAmountLabel").textContent =
      S.contrib === "monthly" ? `Sumă / lună (${w})` : `Sumă investită (${w})`;
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

  // --- horizon (până azi / la scadență) -------------------------------------

  function bindHorizon() {
    el("poHorizon")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => {
        b.onclick = () => {
          S.horizon = b.dataset.hz as OfferHorizon;
          press(el("poHorizon").children, b);
          paint();
        };
      });
  }

  function syncHorizon() {
    const seg = el("poHorizon");
    const btn = [...seg.children].find(
      (x) => (x as HTMLButtonElement).dataset.hz === S.horizon,
    );
    if (btn) press(seg.children, btn);
  }

  // --- single: tranche picker ------------------------------------------------

  function buildPick() {
    const seg = el("poPick");
    seg.innerHTML = editionRungs(S.startId, S.currency)
      .map(
        (r) =>
          `<button data-slot="${r.slot}" aria-pressed="${r.slot === S.pick}" class="${
            r.donor ? "po-tranche--donor" : ""
          }"><span class="po-tranche__mat">${slotLabel(r.slot, r.mat)}</span><span class="po-tranche__rate">${fmt2(
            r.rate,
          )}%</span></button>`,
      )
      .join("");
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => {
        S.pick = b.dataset.slot as Slot;
        press(seg.children, b);
        paint();
      };
    });
  }

  // --- ladder: per-slot weights ----------------------------------------------

  function buildWeights() {
    const box = el("poWeights");
    box.innerHTML = editionRungs(S.startId, S.currency)
      .map(
        (r) => `
        <div class="po-weight${r.donor ? " po-weight--donor" : ""}">
          <span class="po-weight__lab">${slotLabel(r.slot, r.mat)}<em>${fmt2(r.rate)}%</em></span>
          <div class="po-weight__in">
            <input type="number" data-slot="${r.slot}" value="${S.weights[r.slot] ?? 0}" min="0" max="100" step="5" aria-label="Pondere ${slotLabel(r.slot, r.mat)}" />
            <span class="po-weight__suf">%</span>
          </div>
          <span class="po-weight__eff" data-eff="${r.slot}"></span>
        </div>`,
      )
      .join("");
    box.querySelectorAll<HTMLInputElement>("input").forEach((inp) => {
      inp.oninput = () => {
        S.weights[inp.dataset.slot as Slot] = Math.max(0, Number(inp.value) || 0);
        paint();
      };
    });
    el("poEqual").onclick = () => {
      S.weights = defaultWeights(S.startId, S.currency);
      box.querySelectorAll<HTMLInputElement>("input").forEach((inp) => {
        inp.value = String(S.weights[inp.dataset.slot as Slot] ?? 0);
      });
      paint();
    };
  }

  /** Per-contribution effective principal readouts + a weighted-yield hint. */
  function paintWeightEffects(res: OfferResult) {
    const w = ccyWord(S.currency);
    const sum = Object.values(S.weights).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
    el("poWeights")
      .querySelectorAll<HTMLElement>("[data-eff]")
      .forEach((span) => {
        const wt = Math.max(0, S.weights[span.dataset.eff as Slot] ?? 0);
        const per = sum > 0 ? S.amount * (wt / sum) : 0;
        span.textContent = per > 0 ? `→ ${fmt(Math.round(per))} ${w}` : "—";
      });
    const rungs = new Set(res.allocs.filter((a) => a.principal > 0).map((a) => a.slot)).size;
    el("poWeightHint").textContent =
      rungs > 0
        ? `Randament mediu ponderat ${fmt2(res.avgCoupon)}% · ${rungs} ${rungs === 1 ? "tranșă" : "tranșe"}${
            S.contrib === "monthly" ? " / lună" : ""
          }.`
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
      startId: S.startId,
      contrib: S.contrib,
      horizon: S.horizon,
      pick: S.pick,
      weights: S.weights,
    });
    if (S.mode === "ladder") paintWeightEffects(res);
    el("planResult").innerHTML = resultHTML(res);
  }

  // --- wire up ---------------------------------------------------------------

  bindCurrency();
  buildStart();
  bindContrib();
  bindMode();
  bindHorizon();
  resetForEdition();
  applyMode();
  syncHorizon();
  paint();
}

// ── result painters ──────────────────────────────────────────────────────────

function resultHTML(res: OfferResult): string {
  // The deposit/inflation comparison is denominated in RON (BNR deposit rates,
  // INS CPI), so it is meaningless for a EUR plan.
  const bench =
    res.currency === "RON" && res.invested > 0
      ? forwardBenchmarkSectionHTML(res.finalValue, res.invested, res.yieldPct, offerBenchmark(res))
      : "";
  return (
    certHTML(res) +
    growthChartHTML(res) +
    bench +
    couponStripHTML(res) +
    calendarHTML(res) +
    detailHTML(res)
  );
}

/** The certificate face — the headline the whole plan reduces to. */
function certHTML(res: OfferResult): string {
  const w = ccyWord(res.currency);
  const toMaturity = res.horizon === "maturity";
  const valueLabel = toMaturity ? "Total încasat la scadență" : "Valoare azi — unde ai fi";
  const profitCls = res.totalInterest >= 0 ? "pos" : "neg";
  const sign = res.totalInterest >= 0 ? "+" : "−";

  const notes: string[] = [];
  const below = res.allocs.filter((a) => a.belowMin);
  if (below.length) {
    const which = [...new Set(below.map((a) => a.label.toLowerCase()))].join(", ");
    notes.push(`Sub pragul minim uzual (${which}).`);
  }
  if (res.allocs.some((a) => a.donor)) {
    notes.push("Include tranșa pentru donatori de sânge (prag minim redus, 500 lei).");
  }
  const note = notes.length ? `<p class="plan-note">${notes.join(" ")}</p>` : "";

  const invested =
    res.contrib === "monthly"
      ? `Investești <b>${fmt(Math.round(res.allocs.length ? res.invested / res.contributions : 0))} ${w}/lună</b> în ${res.contributions} ediții din ${res.startLabel} — total <b>${fmt(Math.round(res.invested))} ${w}</b>.`
      : `Investești <b>${fmt(Math.round(res.invested))} ${w}</b> în ediția ${res.startLabel}.`;

  return `
    <div class="cert" id="planCert">
      <div class="cert__flag">
        <span class="micro">${valueLabel}</span>
        <span class="cert__free">Cupon neimpozabil</span>
      </div>
      <div class="denom stamp-in">
        <span class="denom__num">${fmt(Math.round(res.finalValue))}</span>
        <span class="denom__ccy">${w}</span>
      </div>
      <div class="cert__supp">
        <div class="supp">
          <span class="supp__k">Câștig net</span>
          <span class="supp__v ${profitCls}">${sign}${fmt(Math.round(Math.abs(res.totalInterest)))} ${w}</span>
        </div>
        <div class="supp">
          <span class="supp__k">Randament pe an (IRR)</span>
          <span class="supp__v">${fmt2(res.yieldPct)}%</span>
        </div>
        <div class="supp">
          <span class="supp__k">${toMaturity ? "Orizont" : "Perioadă"}</span>
          <span class="supp__v">${fmt2(res.years)} ani</span>
        </div>
      </div>
      <p class="plan-invested">${invested}</p>
      ${note}
    </div>`;
}

/** For a one-off plan, each rung as a detachable coupon. Skipped when recurring. */
function couponStripHTML(res: OfferResult): string {
  if (res.contrib === "monthly") return "";
  const title = res.allocs.length > 1 ? "Cupoanele tale" : "Cuponul tău";
  const cards = res.allocs
    .filter((a) => a.principal > 0)
    .map((a, i) => {
      const cls = "coupon" + (a.donor ? " coupon--donor" : "");
      return `
      <div class="${cls}">
        <div class="coupon__stub"><span>Cupon ${String(i + 1).padStart(2, "0")}</span></div>
        <div class="coupon__face">
          <div class="coupon__period">${fmtMonthYear(a.buyYear)} → ${Math.floor(a.buyYear + a.mat)}</div>
          <div class="coupon__rate">${fmt2(a.rate)}%</div>
          <div class="coupon__mat">${a.mat} ani${a.donor ? " · donator" : ""}</div>
          <div class="coupon__foot">
            <span class="coupon__k">Cupon / an</span>
            <span class="coupon__val">${fmt(Math.round(a.couponAnnual))}</span>
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
  const buckets = new Map<number, { total: number; rows: string[] }>();
  for (const f of res.flows) {
    const yr = Math.floor(f.year + 1e-9);
    const b = buckets.get(yr) ?? { total: 0, rows: [] };
    b.total += f.amount;
    b.rows.push(`<tr>
      <td>${fmtMonthYear(f.year)}</td>
      <td>${f.mat} ani${f.donor ? " · donator" : ""}</td>
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

/** Per-rung breakdown: per allocation for a lump, aggregated by slot when recurring. */
function detailHTML(res: OfferResult): string {
  const w = ccyWord(res.currency);
  const rowsHTML =
    res.contrib === "monthly" ? aggregatedRows(res) : allocRows(res.allocs);
  return `
    ${sectionTitle("Detaliu pe tranșe")}
    <table class="detail">
      <thead><tr><th>Tranșă</th><th>Dobândă</th><th>Principal (${w})</th><th>Câștig</th><th>Valoare</th></tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>`;
}

function allocRows(allocs: Alloc[]): string {
  return allocs
    .filter((a) => a.principal > 0)
    .map(
      (a) => `<tr>
      <td>${slotLabel(a.slot, a.mat)}</td>
      <td class="num">${fmt2(a.rate)}%</td>
      <td class="num">${fmt(Math.round(a.principal))}</td>
      <td class="num">${fmt(Math.round(a.valueAtHorizon - a.principal))}</td>
      <td class="num">${fmt(Math.round(a.valueAtHorizon))}</td>
    </tr>`,
    )
    .join("");
}

const SLOT_WORD: Record<Exclude<Slot, "donor">, string> = {
  short: "Scurtă",
  mid: "Medie",
  long: "Lungă",
};

/**
 * Sum a recurring plan's allocations by ladder slot. Coupon rates vary edition
 * to edition, so the rate column shows "—" and the value tells the story.
 */
function aggregatedRows(res: OfferResult): string {
  const order: Slot[] = ["short", "mid", "long", "donor"];
  const bySlot = new Map<Slot, { principal: number; value: number; count: number }>();
  for (const a of res.allocs) {
    if (a.principal <= 0) continue;
    const g = bySlot.get(a.slot) ?? { principal: 0, value: 0, count: 0 };
    g.principal += a.principal;
    g.value += a.valueAtHorizon;
    g.count += 1;
    bySlot.set(a.slot, g);
  }
  return order
    .filter((s) => bySlot.has(s))
    .map((s) => {
      const g = bySlot.get(s)!;
      const word = s === "donor" ? "Donator" : SLOT_WORD[s];
      return `<tr>
      <td>${word} · ${g.count}×</td>
      <td class="num">—</td>
      <td class="num">${fmt(Math.round(g.principal))}</td>
      <td class="num">${fmt(Math.round(g.value - g.principal))}</td>
      <td class="num">${fmt(Math.round(g.value))}</td>
    </tr>`;
    })
    .join("");
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
        `<text x="${xx}" y="${py1 + 16}" class="gc-xlab" text-anchor="middle">${yr}</text>`,
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
  const tag = res.horizon === "maturity" ? "La scadență" : "Azi";
  const endTag = `
    <line x1="${ex}" y1="${ey}" x2="${ex}" y2="${py1}" class="gc-drop" />
    <g class="gc-tag" transform="translate(${round(tagX)}, ${round(Math.max(ey - 30, py0))})">
      <rect width="${tagW}" height="34" rx="3" />
      <text x="9" y="14" class="gc-tagk">${tag}</text>
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
