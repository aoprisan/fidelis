/**
 * The Info tab: a read-only reference charting the coupon rates of *every*
 * Fidelis issuance — RON + EUR, per maturity, newest first.
 *
 * Two views, built once from the pure `HISTORY` table:
 *  - per-maturity trend line charts (one RON, one EUR), collapsing the shifting
 *    tranche sets into three continuous tiers (scurtă / medie / lungă);
 *  - one card per issuance, newest first, each a small bar chart of the coupon
 *    for every tranche in lei and in euro (plus the blood-donor tranche in lei).
 *
 * The inline-SVG scaffold (viewBox geometry, sx/sy scales, grid + year ticks)
 * mirrors `growthChartHTML` in render.ts — the codebase's convention is to copy
 * the scaffold per chart rather than share an SVG util.
 */

import { HISTORY, type Currency, type Issuance } from "../data/history";
import { idToYear, matsAt } from "../sim/history";
import { fmt2, fmtMonthYear } from "./format";

const r = (n: number): number => Math.round(n * 100) / 100;
const pct = (v: number): string => `${fmt2(v)}%`;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A visible chart dot plus a larger transparent hit target carrying its value.
 * The hit circle exposes a native hover `<title>` and a `data-label` the click
 * handler (`attachPointValues`) reads to draw an in-SVG readout.
 */
function pointMark(cx: number, cy: number, dotCls: string, label: string): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="2" class="${dotCls}" />` +
    `<circle cx="${cx}" cy="${cy}" r="8" class="pt-dot" data-label="${esc(label)}"><title>${esc(label)}</title></circle>`
  );
}

/** The tranche table (maturity -> coupon) for a currency. */
const tableOf = (h: Issuance, ccy: Currency): Readonly<Record<number, number>> =>
  ccy === "EUR" ? h.eur : h.maturities;

// ── per-maturity trend chart ─────────────────────────────────────────────────

interface TrendPoint {
  t: number;
  rate: number;
  mat: number;
}

/**
 * Collapse each issuance's tranche set into three tiers so a single line stays
 * continuous across the mid-2025 maturity switch: the shortest tranche, the
 * longest, and (when three or more exist) the middle one.
 */
function tiersFor(ccy: Currency): { short: TrendPoint[]; mid: TrendPoint[]; long: TrendPoint[] } {
  const short: TrendPoint[] = [];
  const mid: TrendPoint[] = [];
  const long: TrendPoint[] = [];
  for (const h of HISTORY) {
    const mats = matsAt(h.id, ccy);
    if (mats.length === 0) continue;
    const tbl = tableOf(h, ccy);
    const t = idToYear(h.id);
    const at = (mat: number): TrendPoint => ({ t, mat, rate: tbl[mat] });
    short.push(at(mats[0]));
    long.push(at(mats[mats.length - 1]));
    if (mats.length >= 3) mid.push(at(mats[Math.floor((mats.length - 1) / 2)]));
  }
  return { short, mid, long };
}

/** "1–2 ani" / "5 ani" — the maturity span a tier covers over the whole series. */
function tierRange(pts: TrendPoint[]): string {
  const mats = pts.map((p) => p.mat);
  const lo = Math.min(...mats);
  const hi = Math.max(...mats);
  return lo === hi ? `${lo} ani` : `${lo}–${hi} ani`;
}

function trendChartHTML(ccy: Currency, heading: string): string {
  const { short, mid, long } = tiersFor(ccy);
  const all = [...short, ...mid, ...long];
  if (all.length < 2) return "";

  const W = 720;
  const H = 250;
  const m = { top: 16, right: 16, bottom: 24, left: 40 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const minT = Math.min(...all.map((p) => p.t));
  const maxT = Math.max(...all.map((p) => p.t));
  const tSpan = Math.max(maxT - minT, 1e-6);

  const rates = all.map((p) => p.rate);
  const yLo = Math.floor(Math.min(...rates));
  const yHi = Math.ceil(Math.max(...rates));
  const ySpan = Math.max(yHi - yLo, 1e-6);

  const sx = (t: number): number => px0 + ((t - minT) / tSpan) * (px1 - px0);
  const sy = (v: number): number => py1 - ((v - yLo) / ySpan) * (py1 - py0);

  // horizontal grid + y labels, one row per whole percent
  const grid: string[] = [];
  const yLabels: string[] = [];
  for (let v = yLo; v <= yHi; v++) {
    const yy = r(sy(v));
    grid.push(`<line x1="${px0}" y1="${yy}" x2="${px1}" y2="${yy}" class="gc-grid" />`);
    yLabels.push(`<text x="${px0 - 8}" y="${yy + 3.5}" class="gc-ylab">${v}%</text>`);
  }

  // x ticks at whole years within range
  const xTicks: string[] = [];
  for (let yr = Math.ceil(minT); yr <= Math.floor(maxT); yr++) {
    const xx = r(sx(yr));
    xTicks.push(
      `<line x1="${xx}" y1="${py1}" x2="${xx}" y2="${py1 + 4}" class="gc-grid" />` +
        `<text x="${xx}" y="${py1 + 16}" class="gc-xlab" text-anchor="middle">${yr}</text>`,
    );
  }

  const series = (pts: TrendPoint[], cls: string): string => {
    if (pts.length === 0) return "";
    const d = pts.map((p, i) => `${i ? "L" : "M"}${r(sx(p.t))} ${r(sy(p.rate))}`).join(" ");
    const dots = pts
      .map((p) =>
        pointMark(r(sx(p.t)), r(sy(p.rate)), `ic-dot ${cls}`, `${p.mat} ani · ${pct(p.rate)} · ${fmtMonthYear(p.t)}`),
      )
      .join("");
    return `<path d="${d}" class="ic-line ${cls}" />${dots}`;
  };

  const legend = [
    `<span class="ic-key ic-key--short">Scurtă · ${tierRange(short)}</span>`,
    mid.length ? `<span class="ic-key ic-key--mid">Medie · ${tierRange(mid)}</span>` : "",
    `<span class="ic-key ic-key--long">Lungă · ${tierRange(long)}</span>`,
  ].join("");

  return `
    <figure class="info-chart">
      <figcaption class="info-chart__cap">${heading}</figcaption>
      <div class="ic-legend">${legend}</div>
      <div class="ic-plot">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evoluția cupoanelor ${heading}">
          ${grid.join("")}
          ${xTicks.join("")}
          ${series(long, "ic-line--long")}
          ${series(mid, "ic-line--mid")}
          ${series(short, "ic-line--short")}
          ${yLabels.join("")}
        </svg>
      </div>
    </figure>`;
}

// ── per-maturity small multiples ─────────────────────────────────────────────

/** Every maturity offered in either currency, ascending. */
function allMaturities(): number[] {
  const set = new Set<number>();
  for (const h of HISTORY) {
    for (const m of matsAt(h.id, "RON")) set.add(m);
    for (const m of matsAt(h.id, "EUR")) set.add(m);
  }
  return [...set].sort((a, b) => a - b);
}

/** Exact coupons for one maturity in one currency, chronological (no fallback). */
function pointsFor(mat: number, ccy: Currency): TrendPoint[] {
  const pts: TrendPoint[] = [];
  for (const h of HISTORY) {
    const rate = tableOf(h, ccy)[mat];
    if (rate != null) pts.push({ t: idToYear(h.id), mat, rate });
  }
  return pts;
}

/** Common axes shared by every small multiple so the panels stay comparable. */
interface Scale {
  minT: number;
  maxT: number;
  yLo: number;
  yHi: number;
}

function matChartSVG(mat: number, s: Scale): string {
  const W = 340;
  const H = 176;
  const m = { top: 8, right: 12, bottom: 22, left: 28 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const tSpan = Math.max(s.maxT - s.minT, 1e-6);
  const ySpan = Math.max(s.yHi - s.yLo, 1e-6);
  const sx = (t: number): number => px0 + ((t - s.minT) / tSpan) * (px1 - px0);
  const sy = (v: number): number => py1 - ((v - s.yLo) / ySpan) * (py1 - py0);

  const grid: string[] = [];
  const yLabels: string[] = [];
  for (let v = s.yLo; v <= s.yHi; v++) {
    const yy = r(sy(v));
    grid.push(`<line x1="${px0}" y1="${yy}" x2="${px1}" y2="${yy}" class="gc-grid" />`);
    yLabels.push(`<text x="${px0 - 6}" y="${yy + 3}" class="gc-ylab">${v}%</text>`);
  }
  const xTicks: string[] = [];
  for (let yr = Math.ceil(s.minT); yr <= Math.floor(s.maxT); yr++) {
    const xx = r(sx(yr));
    xTicks.push(`<text x="${xx}" y="${py1 + 15}" class="gc-xlab" text-anchor="middle">${yr}</text>`);
  }

  const draw = (ccy: Currency, cls: string): string => {
    const pts = pointsFor(mat, ccy);
    if (pts.length === 0) return "";
    const d = pts.map((p, i) => `${i ? "L" : "M"}${r(sx(p.t))} ${r(sy(p.rate))}`).join(" ");
    const line = pts.length >= 2 ? `<path d="${d}" class="mc-line ${cls}" />` : "";
    const name = ccy === "EUR" ? "Euro" : "Lei";
    const dots = pts
      .map((p) =>
        pointMark(r(sx(p.t)), r(sy(p.rate)), `mc-dot ${cls}`, `${name} · ${pct(p.rate)} · ${fmtMonthYear(p.t)}`),
      )
      .join("");
    return line + dots;
  };

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cuponul pe ${mat} ani în timp">
    ${grid.join("")}${xTicks.join("")}
    ${draw("RON", "mc-line--ron")}${draw("EUR", "mc-line--eur")}
    ${yLabels.join("")}
  </svg>`;
}

/** One small line chart per maturity, on a shared scale. */
function maturityChartsHTML(): string {
  const mats = allMaturities();
  const rates: number[] = [];
  for (const mat of mats) {
    for (const ccy of ["RON", "EUR"] as const) {
      for (const p of pointsFor(mat, ccy)) rates.push(p.rate);
    }
  }
  if (rates.length === 0) return "";

  const scale: Scale = {
    minT: idToYear(HISTORY[0].id),
    maxT: idToYear(HISTORY[HISTORY.length - 1].id),
    yLo: Math.floor(Math.min(...rates)),
    yHi: Math.ceil(Math.max(...rates)),
  };

  const cells = mats
    .map(
      (mat) =>
        `<figure class="mc-cell"><figcaption class="mc-cap">${mat} ani</figcaption>${matChartSVG(mat, scale)}</figure>`,
    )
    .join("");

  return `
    <section class="info-maturities">
      <div class="info-maturities__head">
        <h3>Cuponul pe fiecare maturitate</h3>
        <div class="mc-legend">
          <span class="mc-key mc-key--ron">Lei</span>
          <span class="mc-key mc-key--eur">Euro</span>
        </div>
      </div>
      <div class="mc-grid">${cells}</div>
    </section>`;
}

// ── per-issuance coupon bars ─────────────────────────────────────────────────

interface Bar {
  mat: number;
  rate: number;
  label: string;
  cls: string;
  donor?: boolean;
}

/** A fixed 0–9% ceiling so bar heights stay comparable from card to card. */
const BAR_MAX = 9;

function barsSVG(bars: Bar[], aria: string): string {
  if (bars.length === 0) return "";
  const W = 320;
  const H = 170;
  const m = { top: 22, right: 6, bottom: 22, left: 6 };
  const px0 = m.left;
  const px1 = W - m.right;
  const py0 = m.top;
  const py1 = H - m.bottom;

  const sy = (v: number): number => py1 - (v / BAR_MAX) * (py1 - py0);
  const slot = (px1 - px0) / bars.length;
  const bw = Math.min(46, slot * 0.62);

  const marks = bars
    .map((b, i) => {
      const cx = px0 + slot * (i + 0.5);
      const x = cx - bw / 2;
      const y = r(sy(b.rate));
      const h = r(py1 - y);
      const title = `${b.mat} ani · ${pct(b.rate)}${b.donor ? " · donator" : ""}`;
      return (
        `<rect x="${r(x)}" y="${y}" width="${r(bw)}" height="${h}" rx="1" class="${b.cls}"><title>${title}</title></rect>` +
        `<text x="${r(cx)}" y="${r(y - 5)}" class="rc-val" text-anchor="middle">${pct(b.rate)}</text>` +
        `<text x="${r(cx)}" y="${py1 + 14}" class="rc-lab" text-anchor="middle">${b.label}</text>`
      );
    })
    .join("");

  const axis = `<line x1="${px0}" y1="${r(sy(0))}" x2="${px1}" y2="${r(sy(0))}" class="rc-axis" />`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">${axis}${marks}</svg>`;
}

function ronBars(h: Issuance): Bar[] {
  const tbl = h.maturities;
  const bars: Bar[] = matsAt(h.id, "RON").map((mat) => ({
    mat,
    rate: tbl[mat],
    label: `${mat} ani`,
    cls: "rc-bar",
  }));
  if (h.donorRate != null) {
    const mat = h.donorMaturity ?? 2;
    bars.push({ mat, rate: h.donorRate, label: `★ ${mat} ani`, cls: "rc-bar rc-bar--donor", donor: true });
  }
  return bars;
}

function eurBars(h: Issuance): Bar[] {
  const tbl = h.eur;
  const bars: Bar[] = matsAt(h.id, "EUR").map((mat) => ({
    mat,
    rate: tbl[mat],
    label: `${mat} ani`,
    cls: "rc-bar rc-bar--eur",
  }));
  if (h.donorRateEur != null) {
    const mat = h.donorMaturityEur ?? 2;
    bars.push({ mat, rate: h.donorRateEur, label: `★ ${mat} ani`, cls: "rc-bar rc-bar--donor", donor: true });
  }
  return bars;
}

/** "2024-02-21/03-01" -> "21 feb. 2024 – 01 mar. 2024" (best-effort, ro-RO). */
function windowLabel(win: string): string {
  const [a, b] = win.split("/");
  const day = (iso: string, fallbackYear: string): string => {
    const parts = iso.split("-");
    const [y, mo, d] = parts.length === 3 ? parts : [fallbackYear, parts[0], parts[1]];
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return dt.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
  };
  const year = a.split("-")[0];
  return b ? `${day(a, year)} – ${day(b, year)}` : day(a, year);
}

function cardHTML(h: Issuance): string {
  const badge = h.unverified ? `<span class="rc-badge">neverificat</span>` : "";
  // `notes` mixes issuance detail with internal QA flags (prefixed "FLAG:") —
  // the verification caveat is already carried by the badge, so drop those.
  const showNote = h.notes && !/^FLAG:/i.test(h.notes.trim());
  const notes = showNote ? `<p class="rc-notes">${esc(h.notes as string)}</p>` : "";
  return `
    <article class="rate-card">
      <header class="rate-card__head">
        <h3>${esc(h.label)}${badge}</h3>
        <span class="rc-window">Subscriere · ${windowLabel(h.subscriptionWindow)}</span>
      </header>
      <div class="rate-card__body">
        <div class="rc-panel">
          <span class="rc-ccy">Lei</span>
          ${barsSVG(ronBars(h), `Cupoane în lei · ${h.label}`)}
        </div>
        <div class="rc-panel">
          <span class="rc-ccy">Euro</span>
          ${barsSVG(eurBars(h), `Cupoane în euro · ${h.label}`)}
        </div>
      </div>
      ${notes}
      <a class="rc-src" href="${h.sourceUrl}" target="_blank" rel="noopener">Sursă oficială</a>
    </article>`;
}

// ── interaction ──────────────────────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Reveal a point's value on click: draw a small readout tag at the clicked dot,
 * in the same SVG coordinate space (so no screen-coord conversion). Clicking
 * empty chart space dismisses it. Line points otherwise carry no visible value.
 */
function attachPointValues(container: HTMLElement): void {
  if (typeof container.addEventListener !== "function") return;
  container.addEventListener("click", (e) => {
    const hit = (e.target as Element).closest?.(".pt-dot") as SVGCircleElement | null;
    container.querySelectorAll(".pt-tip").forEach((n) => n.remove());
    if (!hit) return;
    const svg = hit.ownerSVGElement;
    const label = hit.dataset.label;
    if (!svg || !label) return;

    const cx = Number(hit.getAttribute("cx"));
    const cy = Number(hit.getAttribute("cy"));
    const vb = svg.viewBox.baseVal;
    const w = Math.max(46, label.length * 5.5 + 14);
    const h = 17;
    const x = Math.max(vb.x + 2, Math.min(cx - w / 2, vb.x + vb.width - w - 2));
    const y = cy - h - 7 < vb.y + 2 ? cy + 9 : cy - h - 7;

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "pt-tip");
    g.setAttribute("transform", `translate(${r(x)},${r(y)})`);
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(r(w)));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", "2");
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(r(w / 2)));
    text.setAttribute("y", "12");
    text.setAttribute("text-anchor", "middle");
    text.textContent = label;
    g.append(rect, text);
    svg.appendChild(g);
  });
}

// ── mount ────────────────────────────────────────────────────────────────────

/** Build the whole Info view into `container` (idempotent — replaces content). */
export function initInfo(container: HTMLElement): void {
  const cards = [...HISTORY].reverse().map(cardHTML).join("");
  container.innerHTML = `
    <div class="info">
      <div class="info__head">
        <h2>Dobânzile emisiunilor Fidelis</h2>
        <span class="micro">2024–2026 · cele mai noi întâi</span>
      </div>
      <p class="info__intro">
        Cuponul anual fix, neimpozabil, al fiecărei emisiuni — pe maturitate.
        Sus: evoluția în timp pe tranșe (scurtă / medie / lungă). Jos: fiecare
        emisiune, cu tranșele în lei și în euro.
      </p>
      <div class="info-trends">
        ${trendChartHTML("RON", "Cupoane în lei")}
        ${trendChartHTML("EUR", "Cupoane în euro")}
      </div>
      ${maturityChartsHTML()}
      <div class="info-cards">${cards}</div>
    </div>`;
  attachPointValues(container);
}
