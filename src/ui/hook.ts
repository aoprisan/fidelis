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

  const chips = (map: Readonly<Record<number, number>>, cls: string): string =>
    Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map((m) => `<span class="hook-rate ${cls}"><b>${map[m]}%</b> · ${m} ani</span>`)
      .join("");

  const ronDonor =
    latest.donorRate != null
      ? `<span class="hook-rate hook-donor"><b>${latest.donorRate}%</b> · ${latest.donorMaturity ?? 2} ani, donatori</span>`
      : "";
  const eurDonor =
    latest.donorRateEur != null
      ? `<span class="hook-rate hook-donor hook-rate--eur"><b>${latest.donorRateEur}%</b> · ${latest.donorMaturityEur ?? 2} ani, donatori</span>`
      : "";

  host.innerHTML = `
    <p class="hook-eyebrow">Ultimele dobânzi cunoscute · ${latest.label}</p>
    <div class="hook-rates"><span class="hook-ccy">Lei</span>${chips(latest.maturities, "")}${ronDonor}</div>
    <div class="hook-rates"><span class="hook-ccy">Euro</span>${chips(latest.eur, "hook-rate--eur")}${eurDonor}</div>
    <p class="hook-copy">Modelul de mai jos folosește istoricul real — dobânzile de mai sus îți arată la ce nivel poți subscrie acum, fără comisioane și fără impozit pe câștig.
      <a href="${MF_SOURCE}" target="_blank" rel="noopener">Vezi următoarea emisiune pe mfinante.gov.ro →</a></p>`;
}
