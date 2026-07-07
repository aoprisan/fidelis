import { HISTORY, MF_SOURCE } from "../data/history";

/**
 * One-shot forward-looking callout in the masthead: the latest known issuance's
 * rates, so the page answers "la ce nivel pot subscrie acum", not only "cât aș
 * fi câștigat". Param-independent, so it lives outside the render cycle.
 */
export function initHook(): void {
  const host = document.getElementById("hook");
  if (!host) return;
  const latest = HISTORY[HISTORY.length - 1];
  const mats = Object.keys(latest.ron)
    .map(Number)
    .sort((a, b) => a - b);
  const chips = mats
    .map((m) => `<span class="hook-rate"><b>${latest.ron[m]}%</b> · ${m} ani</span>`)
    .join("");
  const donor =
    latest.donor != null
      ? `<span class="hook-rate hook-donor"><b>${latest.donor}%</b> · 2 ani, donatori</span>`
      : "";
  host.innerHTML = `
    <p class="hook-eyebrow">Ultimele dobânzi cunoscute · ${latest.label}</p>
    <div class="hook-rates">${chips}${donor}</div>
    <p class="hook-copy">Modelul de mai jos folosește istoricul real — dobânzile de mai sus îți arată la ce nivel poți subscrie acum, fără comisioane și fără impozit pe câștig.
      <a href="${MF_SOURCE}" target="_blank" rel="noopener">Vezi următoarea emisiune pe mfinante.gov.ro →</a></p>`;
}
