import { HISTORY, MF_SOURCE } from "../data/history";

/**
 * One-shot forward-looking callout in the masthead: the latest known issuance's
 * rates, so the page answers "la ce nivel pot subscrie acum", not only "cât aș
 * fi câștigat". Param-independent, so it lives outside the render cycle.
 */
/** Rate chips for a coupon map (maturity -> rate), ascending by maturity. */
function rateChips(rates: Readonly<Record<number, number>>, suffix: string): string {
  return Object.keys(rates)
    .map(Number)
    .sort((a, b) => a - b)
    .map((m) => `<span class="hook-rate"><b>${rates[m]}%</b> · ${m} ani${suffix}</span>`)
    .join("");
}

export function initHook(): void {
  const host = document.getElementById("hook");
  if (!host) return;
  const latest = HISTORY[HISTORY.length - 1];
  const ronChips = rateChips(latest.ron, "");
  const donor =
    latest.donor != null
      ? `<span class="hook-rate hook-donor"><b>${latest.donor}%</b> · 2 ani, donatori</span>`
      : "";
  const eurChips = latest.eur ? rateChips(latest.eur, " €") : "";
  host.innerHTML = `
    <p class="hook-eyebrow">Ultimele dobânzi cunoscute · ${latest.label}</p>
    <div class="hook-rates">${ronChips}${donor}${eurChips}</div>
    <p class="hook-copy">Modelul de mai jos folosește istoricul real — dobânzile de mai sus îți arată la ce nivel poți subscrie acum, în lei sau în euro, fără comisioane și fără impozit pe câștig.
      <a href="${MF_SOURCE}" target="_blank" rel="noopener">Vezi următoarea emisiune pe mfinante.gov.ro →</a></p>`;
}
