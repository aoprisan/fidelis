import { byId, idToYear } from "../sim/history";
import { END } from "../data/history";
import {
  finalValueOf,
  run,
  summarize,
  trajectory,
  type Leg,
  type SimParams,
  type ValuePoint,
} from "../sim/simulate";
import type { AppController } from "./app";
import { fmt, fmt2, fmtK } from "./format";
import { buildImagePdf } from "./pdf";

/**
 * Dependency-free export/share: the current scenario is painted onto a
 * `<canvas>` (a branded "report card" mirroring the on-page design) and then
 * saved as a PNG, wrapped into a one-page PDF, or handed to the Web Share API.
 */

// Palette, mirrored from styles.css so the export matches the live view.
const C = {
  ink: "#0c1524",
  ink2: "#131f33",
  panel: "#182740",
  line: "#26374f",
  gold: "#d8a54a",
  paper: "#eef2f6",
  muted: "#8ba0bb",
  green: "#57b98a",
};
const MONO = 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const STRAT_LABEL: Record<SimParams["strat"], string> = {
  single: "O emisiune",
  ladder: "Scară (ladder)",
};

const W = 900; // logical canvas width
const P = 44; // outer padding

/** Set letter-spacing when the browser supports it (best-effort). */
function tracking(ctx: CanvasRenderingContext2D, value: string): void {
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = value;
}

function paramsLine(p: SimParams): string {
  const bits = [`${fmt(p.amount)} RON`, byId[p.startId].label, STRAT_LABEL[p.strat]];
  if (p.strat === "single") bits.push(`${p.mat} ani`);
  if (p.donor) bits.push("Donator");
  bits.push(p.reinvest ? "Reinvestit" : "Fără reinvestire");
  return bits.join("  ·  ");
}

/**
 * Render the scenario to a canvas. Returns the canvas plus its logical size
 * (device-pixel size is `logical × dpr`).
 */
export function drawReport(
  params: SimParams,
  title: string,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const res = run(params);
  const legs: Leg[] = res.blocks.flatMap((b) => b.legs);
  const s = summarize(params);
  const finalValue = finalValueOf(res);

  // --- layout pass: collect draw ops while advancing the y cursor ---------
  const ops: Array<(c: CanvasRenderingContext2D) => void> = [];
  let y = P;

  // header
  ops.push((c) => {
    c.textBaseline = "alphabetic";
    c.fillStyle = C.gold;
    c.font = `600 12px ${MONO}`;
    tracking(c, "0.22em");
    c.fillText("PROGRAM FIDELIS · SIMULATOR DE RANDAMENT", P, P + 12);
    tracking(c, "0em");
  });
  y += 30;
  const titleY = y;
  ops.push((c) => {
    c.fillStyle = C.paper;
    c.font = `700 30px ${SANS}`;
    c.fillText(title, P, titleY + 24);
  });
  y += 42;
  const subY = y;
  ops.push((c) => {
    c.fillStyle = C.muted;
    c.font = `13px ${MONO}`;
    c.fillText(paramsLine(params), P, subY + 12);
  });
  y += 22;
  const sepY = y + 12;
  ops.push((c) => {
    c.strokeStyle = C.line;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(P, sepY + 0.5);
    c.lineTo(W - P, sepY + 0.5);
    c.stroke();
  });
  y += 34;

  // headline stats (three cards)
  const cards: Array<{ k: string; v: string; color: string }> = [
    { k: "VALOARE AZI", v: `${fmt(finalValue)} RON`, color: C.gold },
    { k: "CÂȘTIG NET (NEIMPOZABIL)", v: `+${fmt(s.profit)} RON`, color: C.green },
    { k: "RANDAMENT ANUALIZAT", v: `${fmt2(s.cagr)}%`, color: C.paper },
  ];
  const cardsY = y;
  const cardH = 78;
  ops.push((c) => {
    const inner = W - 2 * P;
    const gap = 1;
    const cw = (inner - 2 * gap) / 3;
    c.fillStyle = C.line;
    c.fillRect(P, cardsY, inner, cardH);
    cards.forEach((card, i) => {
      const cx = P + i * (cw + gap);
      c.fillStyle = C.panel;
      c.fillRect(cx, cardsY, cw, cardH);
      c.fillStyle = C.muted;
      c.font = `10px ${MONO}`;
      tracking(c, "0.12em");
      c.fillText(card.k, cx + 16, cardsY + 26);
      tracking(c, "0em");
      c.fillStyle = card.color;
      c.font = `700 24px ${MONO}`;
      c.fillText(card.v, cx + 16, cardsY + 58);
    });
  });
  y += cardH + 30;

  // growth chart
  const points = trajectory(res);
  if (points.length >= 2) {
    ops.push(sectionTitle("EVOLUȚIA VALORII ÎN TIMP", y));
    y += 22;
    const chartY = y;
    const chartH = 210;
    ops.push((c) => drawGrowthChart(c, points, params.amount, P, chartY, W - 2 * P, chartH));
    y += chartH + 30;
  }

  // timeline
  ops.push(sectionTitle("CRONOLOGIE EMISIUNI & MATURITĂȚI", y));
  y += 26;
  const labelW = 116;
  const trackX = P + labelW + 12;
  const trackW = W - P - trackX;
  const minY = idToYear(params.startId);
  const span = Math.max(END - minY, 0.0001);
  const laneH = 30;
  const laneGap = 8;
  legs.forEach((leg) => {
    const laneY = y;
    ops.push((c) => drawLane(c, leg, laneY, labelW, trackX, trackW, minY, span, laneH));
    y += laneH + laneGap;
  });
  // axis
  const axisY = y;
  ops.push((c) => {
    c.fillStyle = C.muted;
    c.font = `10px ${MONO}`;
    for (let yr = Math.ceil(minY); yr <= Math.floor(END); yr++) {
      const x = trackX + ((yr - minY) / span) * trackW;
      c.textAlign = yr === Math.floor(END) ? "right" : "left";
      c.fillText(String(yr), Math.min(x, W - P), axisY + 8);
    }
    c.textAlign = "left";
  });
  y += 30;

  // detail table
  ops.push(sectionTitle("DETALIU PE TRANȘE", y));
  y += 24;
  const cols = tableColumns();
  const headY = y;
  ops.push((c) => {
    c.font = `10px ${MONO}`;
    c.fillStyle = C.muted;
    tracking(c, "0.06em");
    for (const col of cols) drawCell(c, col.header, col, headY + 12);
    tracking(c, "0em");
    c.strokeStyle = C.line;
    c.beginPath();
    c.moveTo(P, headY + 22.5);
    c.lineTo(W - P, headY + 22.5);
    c.stroke();
  });
  y += 30;
  legs.forEach((leg) => {
    const rowY = y;
    ops.push((c) => {
      c.font = `12.5px ${MONO}`;
      const cells = cellValues(leg);
      cols.forEach((col, i) => {
        c.fillStyle = i === cols.length - 1 && !leg.matured ? C.gold : C.paper;
        drawCell(c, cells[i], col, rowY + 14);
      });
      c.strokeStyle = C.line;
      c.beginPath();
      c.moveTo(P, rowY + 24.5);
      c.lineTo(W - P, rowY + 24.5);
      c.stroke();
    });
    y += 28;
  });
  y += 22;

  // footer
  const disclaimer =
    "Instrument educativ. Nu este consultanță de investiții. Randamentele istorice nu " +
    "garantează rezultate viitoare. Verifică termenii oficiali pe mfinante.gov.ro.";
  const discY = y;
  ops.push((c) => {
    c.strokeStyle = C.gold;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(P + 1, discY);
    c.lineTo(P + 1, discY + 44);
    c.stroke();
    c.fillStyle = C.muted;
    c.font = `12px ${SANS}`;
    wrapText(c, disclaimer, P + 14, discY + 14, W - P - (P + 14), 17);
  });
  y += 58;
  const metaY = y;
  ops.push((c) => {
    c.fillStyle = C.muted;
    c.font = `11px ${MONO}`;
    const stamp = new Date().toLocaleDateString("ro-RO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    c.fillText(`Generat ${stamp} · fidelis-backtester`, P, metaY + 10);
  });
  y += 24;

  const height = y + P - laneGap;

  // --- render pass --------------------------------------------------------
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const op of ops) op(ctx);

  return { canvas, width: W, height };
}

function sectionTitle(text: string, yy: number) {
  return (c: CanvasRenderingContext2D) => {
    c.fillStyle = C.muted;
    c.font = `11px ${MONO}`;
    tracking(c, "0.16em");
    c.fillText(text, P, yy + 12);
    tracking(c, "0em");
  };
}

function drawLane(
  c: CanvasRenderingContext2D,
  leg: Leg,
  laneY: number,
  labelW: number,
  trackX: number,
  trackW: number,
  minY: number,
  span: number,
  laneH: number,
): void {
  c.fillStyle = C.muted;
  c.font = `12px ${MONO}`;
  c.textAlign = "right";
  c.fillText(`${leg.startLabel} · ${leg.mat}a`, P + labelW, laneY + laneH / 2 + 4);
  c.textAlign = "left";
  // track
  c.fillStyle = C.ink2;
  roundRect(c, trackX, laneY, trackW, laneH, 3);
  c.fill();
  // bar
  const left = ((leg.startY - minY) / span) * trackW;
  const width = ((Math.min(leg.endY, END) - leg.startY) / span) * trackW;
  const bx = trackX + left;
  const bw = Math.max(width, 2);
  const grad = c.createLinearGradient(bx, 0, bx + bw, 0);
  grad.addColorStop(0, "rgba(216,165,74,0.85)");
  grad.addColorStop(1, "rgba(216,165,74,0.45)");
  c.save();
  roundRect(c, trackX, laneY, trackW, laneH, 3);
  c.clip();
  c.fillStyle = grad;
  c.fillRect(bx, laneY, bw, laneH);
  c.fillStyle = C.gold;
  c.fillRect(bx + bw - 2, laneY, 2, laneH);
  c.fillStyle = C.ink;
  c.font = `700 11px ${MONO}`;
  c.fillText(`${leg.rate}%`, bx + 8, laneY + laneH / 2 + 4);
  c.restore();
}

/** Paint the value-over-time growth chart into a box on the report card. */
function drawGrowthChart(
  c: CanvasRenderingContext2D,
  points: ValuePoint[],
  invested: number,
  x: number,
  yTop: number,
  w: number,
  h: number,
): void {
  const padL = 62;
  const padR = 18;
  const padT = 12;
  const padB = 22;
  const px0 = x + padL;
  const px1 = x + w - padR;
  const py0 = yTop + padT;
  const py1 = yTop + h - padB;

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

  // panel background
  c.fillStyle = C.ink2;
  roundRect(c, x, yTop, w, h, 4);
  c.fill();

  // horizontal grid + y labels
  const rows = 4;
  c.strokeStyle = C.line;
  c.lineWidth = 1;
  c.fillStyle = C.muted;
  c.font = `10px ${MONO}`;
  c.textAlign = "right";
  for (let i = 0; i <= rows; i++) {
    const v = yLo + (ySpan * i) / rows;
    const yy = Math.round(sy(v)) + 0.5;
    c.beginPath();
    c.moveTo(px0, yy);
    c.lineTo(px1, yy);
    c.stroke();
    c.fillText(fmtK(v), px0 - 8, sy(v) + 3);
  }

  // x ticks (whole years)
  c.textAlign = "center";
  for (let yr = Math.ceil(minT); yr <= Math.floor(maxT); yr++) {
    c.fillText(String(yr), sx(yr), py1 + 15);
  }
  c.textAlign = "left";

  // area fill under the curve
  c.beginPath();
  points.forEach((p, i) => {
    const xx = sx(p.t);
    const yy = sy(p.value);
    if (i === 0) c.moveTo(xx, yy);
    else c.lineTo(xx, yy);
  });
  c.lineTo(px1, py1);
  c.lineTo(px0, py1);
  c.closePath();
  const grad = c.createLinearGradient(0, py0, 0, py1);
  grad.addColorStop(0, "rgba(216,165,74,0.34)");
  grad.addColorStop(1, "rgba(216,165,74,0.02)");
  c.fillStyle = grad;
  c.fill();

  // value line
  c.beginPath();
  points.forEach((p, i) => {
    const xx = sx(p.t);
    const yy = sy(p.value);
    if (i === 0) c.moveTo(xx, yy);
    else c.lineTo(xx, yy);
  });
  c.strokeStyle = C.gold;
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.stroke();

  // invested baseline
  const byBase = sy(invested);
  if (byBase >= py0 && byBase <= py1) {
    c.save();
    c.strokeStyle = C.muted;
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.moveTo(px0, byBase);
    c.lineTo(px1, byBase);
    c.stroke();
    c.restore();
    c.fillStyle = C.muted;
    c.font = `10px ${MONO}`;
    c.textAlign = "right";
    c.fillText(`Investit · ${fmtK(invested)}`, px1, byBase - 6);
    c.textAlign = "left";
  }

  // end marker
  const last = points[points.length - 1];
  const ex = sx(last.t);
  const ey = sy(last.value);
  c.fillStyle = C.gold;
  c.beginPath();
  c.arc(ex, ey, 4, 0, Math.PI * 2);
  c.fill();
}

interface Column {
  header: string;
  x: number;
  align: "left" | "right";
}

function tableColumns(): Column[] {
  const right = W - P;
  return [
    { header: "Emisiune", x: P, align: "left" },
    { header: "Scad.", x: right - 512, align: "right" },
    { header: "Dobândă", x: right - 384, align: "right" },
    { header: "Principal", x: right - 232, align: "right" },
    { header: "Cupon/an", x: right - 96, align: "right" },
    { header: "Status", x: right, align: "right" },
  ];
}

function cellValues(leg: Leg): string[] {
  return [
    leg.startLabel,
    `${leg.mat} ani`,
    `${leg.rate.toFixed(2)}%`,
    fmt(leg.principal),
    fmt(leg.couponAnnual),
    leg.matured ? "scadent" : "în curs",
  ];
}

function drawCell(c: CanvasRenderingContext2D, text: string, col: Column, y: number): void {
  c.textAlign = col.align;
  c.fillText(text, col.x, y);
  c.textAlign = "left";
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrapText(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, cy);
      line = word;
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line) c.fillText(line, x, cy);
}

// --- file helpers ---------------------------------------------------------

function slug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "scenariu";
  return `fidelis-${base}`;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
      "image/png",
    ),
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const jpeg = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92));
  const pdf = buildImagePdf(jpeg, canvas.width, canvas.height);
  return new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" });
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Feedback on a button: flash a "done" label briefly. */
function flash(btn: HTMLElement, msg: string): void {
  const prev = btn.textContent;
  btn.textContent = msg;
  btn.setAttribute("disabled", "true");
  setTimeout(() => {
    btn.textContent = prev;
    btn.removeAttribute("disabled");
  }, 1400);
}

/** Wire the export/share toolbar to the current scenario. */
export function initExport(app: AppController, getTitle: () => string): void {
  const byIdEl = (id: string) => document.getElementById(id);
  const pngBtn = byIdEl("dlPng");
  const pdfBtn = byIdEl("dlPdf");
  const shareBtn = byIdEl("shareImg") as HTMLButtonElement | null;
  const linkBtn = byIdEl("copyLink");

  const current = () => drawReport(app.getParams(), getTitle());

  pngBtn?.addEventListener("click", async () => {
    const { canvas } = current();
    download(await canvasToPngBlob(canvas), `${slug(getTitle())}.png`);
    flash(pngBtn, "Descărcat ✓");
  });

  pdfBtn?.addEventListener("click", () => {
    const { canvas } = current();
    download(canvasToPdfBlob(canvas), `${slug(getTitle())}.pdf`);
    flash(pdfBtn, "Descărcat ✓");
  });

  // Web Share API with a PNG file, when available (mobile/modern browsers).
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (shareBtn) {
    const canShareFiles =
      typeof nav.share === "function" && typeof nav.canShare === "function";
    if (!canShareFiles) {
      shareBtn.style.display = "none";
    } else {
      shareBtn.addEventListener("click", async () => {
        const { canvas } = current();
        const blob = await canvasToPngBlob(canvas);
        const file = new File([blob], `${slug(getTitle())}.png`, { type: "image/png" });
        if (!nav.canShare?.({ files: [file] })) {
          download(blob, file.name);
          return;
        }
        try {
          await nav.share!({ files: [file], title: getTitle(), text: "Scenariu Fidelis" });
        } catch {
          /* user cancelled */
        }
      });
    }
  }

  linkBtn?.addEventListener("click", async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      flash(linkBtn, "Link copiat ✓");
    } catch {
      window.prompt("Copiază linkul scenariului:", url);
    }
  });
}
