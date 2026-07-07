import {
  buildObservations,
  couponRange,
  fitModel,
  forecast,
  TERMS,
  tenorBands,
  type MacroAssumption,
  type Regression,
  type ScenarioForecast,
} from "../forecast";
import { fmt2 } from "./format";

/** DOM targets the forecast layer writes into. */
export interface ForecastTargets {
  bands: HTMLElement;
  scenarios: HTMLElement;
  model: HTMLElement;
}

/** The fitted model is data-only and constant, so fit it once. */
const OBS = buildObservations();
const REG: Regression = fitModel(OBS);
const SUPPORT = couponRange(OBS);

const pct = (n: number) => `${fmt2(n)}%`;
const signed = (n: number, digits = 2) =>
  (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(digits);

/** Per-tenor min–max band — the "range, not a prediction" headline. */
function bandsHTML(forecasts: ScenarioForecast[]): string {
  const bands = tenorBands(forecasts, SUPPORT);
  const cards = bands
    .map(
      (b) => `<div class="fc-band">
        <div class="k">${b.tenor} ani</div>
        <div class="v num">${pct(b.min)} – ${pct(b.max)}</div>
        ${
          b.extrapolated
            ? `<div class="flag" title="Banda depășește intervalul cupoanelor istorice (${pct(SUPPORT.min)}–${pct(SUPPORT.max)})">⚠ extrapolare</div>`
            : `<div class="flag ok">în interval istoric</div>`
        }
      </div>`,
    )
    .join("");
  return `
    <div class="laddertitle">Interval de cupon implicat de model (nu o predicție punctuală)</div>
    <div class="fc-bands">${cards}</div>`;
}

/** One card per scenario, with its macro assumptions fully visible. */
function scenariosHTML(forecasts: ScenarioForecast[]): string {
  const cards = forecasts
    .map((f) => {
      const coupons = f.coupons
        .map(
          (c) =>
            `<div class="fc-coupon"><span>${c.tenor}a</span><b class="num">${pct(c.coupon)}</b></div>`,
        )
        .join("");
      const d = f.def;
      const delta = (label: string, dv: number, digits: number, unit: string) =>
        dv === 0
          ? `<li>${label}: <span class="num">${valueFor(f.assumption, label)}</span></li>`
          : `<li>${label}: <span class="num">${valueFor(f.assumption, label)}</span> <em>(${signed(dv, digits)}${unit})</em></li>`;
      return `<div class="fc-card fc-${f.key}">
        <div class="fc-card-h"><b>${f.label}</b></div>
        <p class="fc-narr">${f.narrative}</p>
        <ul class="fc-assump">
          ${delta("NBR", d.dNbr, 2, "pp")}
          ${delta("CPI", d.dCpi, 1, "pp")}
          ${delta("EUR/RON", d.dEurRon, 2, "")}
        </ul>
        <div class="fc-coupons">${coupons}</div>
      </div>`;
    })
    .join("");
  return `
    <div class="laddertitle">Trei scenarii macro · cupon implicat pe maturitate</div>
    <div class="fc-cards">${cards}</div>`;
}

/** Read the assumption value that matches an assumption label. */
function valueFor(a: MacroAssumption, label: string): string {
  if (label === "NBR") return `${fmt2(a.nbr)}%`;
  if (label === "CPI") return `${fmt2(a.cpi)}%`;
  return fmt2(a.eurRon);
}

/** The model inspector: formula, coefficients, fit quality, honest caveats. */
function modelHTML(): string {
  const c = REG.coef;
  const term = (i: number) =>
    `<span class="coef ${c[i + 1] >= 0 ? "pos" : "neg"}">${signed(c[i + 1], 3)}</span>·<span class="var">${TERMS[i]}</span>`;
  const rows = TERMS.map(
    (t, i) => `<tr>
      <td>${t}</td>
      <td class="num">${signed(c[i + 1], 4)}</td>
      <td>${interpret(i, c[i + 1])}</td>
    </tr>`,
  ).join("");
  return `
    <div class="laddertitle">Modelul, la vedere — fără cutie neagră</div>
    <div class="fc-formula">
      cupon% ≈ <span class="coef">${c[0].toFixed(3)}</span>
      ${term(0)} ${term(1)} ${term(2)} ${term(3)}
    </div>
    <div class="fc-fit">
      <span>R² = <b>${fmt2(REG.r2)}</b></span>
      <span>Eroare tipică (RMSE) = <b>${fmt2(REG.rmse)} pp</b></span>
      <span>Observații = <b>${REG.n}</b></span>
      <span>Cupoane istorice = <b>${pct(SUPPORT.min)}–${pct(SUPPORT.max)}</b></span>
    </div>
    <div class="table-scroll"><table class="detail fc-coef">
      <thead><tr><th>Variabilă</th><th>Coeficient</th><th>Citire</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note fc-caveat">
      <b>Cum se citește:</b> este o regresie liniară simplă (metoda celor mai mici pătrate) pe
      tabelul real al cupoanelor Fidelis 2024–2025, îmbinat cu trei serii macro la momentul emisiunii.
      Fiecare coeficient arată cât mișcă un cupon o modificare de o unitate a variabilei, celelalte fixe.
      <b>Atenție:</b> pe acest eșantion scurt și confuz, coeficienții pentru inflație (CPI) și dobânda de
      politică (NBR) ies cu semn <i>contraintuitiv</i> — statul a tăiat cupoanele spre finalul lui 2025
      chiar dacă inflația creștea. Nu tratați coeficienții drept lege economică; de aceea arătăm un
      <b>interval de scenarii</b>, niciodată o singură predicție.
    </p>`;
}

/** A short, honest interpretation string per coefficient. */
function interpret(i: number, coef: number): string {
  const dir = coef >= 0 ? "crește" : "scade";
  switch (TERMS[i]) {
    case "NBR":
      return `+1pp dobândă BNR → cupon ${dir} cu ${Math.abs(coef).toFixed(2)}pp (semn instabil: NBR aproape constant în eșantion)`;
    case "CPI":
      return `+1pp inflație → cupon ${dir} cu ${Math.abs(coef).toFixed(2)}pp (semn contraintuitiv — vezi nota)`;
    case "EUR/RON":
      return `+0,1 leu/euro → cupon ${dir} cu ${Math.abs(coef * 0.1).toFixed(2)}pp (leu mai slab → cupon mai mare)`;
    default:
      return `+1 an maturitate → cupon ${dir} cu ${Math.abs(coef).toFixed(2)}pp (primă de termen)`;
  }
}

/** Compute the forecast for a base assumption and paint all three regions. */
export function renderForecast(base: MacroAssumption, els: ForecastTargets): void {
  const forecasts = forecast(REG, base);
  els.bands.innerHTML = bandsHTML(forecasts);
  els.scenarios.innerHTML = scenariosHTML(forecasts);
  els.model.innerHTML = modelHTML();
}
