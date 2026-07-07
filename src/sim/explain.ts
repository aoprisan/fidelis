/**
 * Serialize the current portfolio state + simulated results into a compact,
 * self-contained prompt, and deep-link it to a fresh claude.ai conversation.
 *
 * Pure and DOM-free: it just builds strings. The UI layer (`ui/explain.ts`)
 * owns opening the link and the clipboard fallback. No API key, no backend —
 * the prompt travels in the URL's `?q=` query and is prefilled client-side.
 */

import { byId } from "./history";
import { run, summarize, type SimParams } from "./simulate";

/** ro-RO integer formatting (no decimals), matching the UI. */
const nf0 = (n: number): string => n.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
/** ro-RO two-decimal formatting, matching the UI. */
const nf2 = (n: number): string =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Human-readable one-line description of the chosen strategy. */
function strategyLine(p: SimParams): string {
  const parts: string[] = [];
  parts.push(
    p.strat === "single"
      ? `o singură emisiune (maturitate ${p.mat} ani)`
      : "scară (ladder) pe 3 maturități",
  );
  if (p.donor) parts.push("tranșă donator de sânge (2 ani)");
  parts.push(p.reinvest ? "reinvestire la scadență" : "fără reinvestire");
  return parts.join(", ");
}

/**
 * Build the compact prompt for "Explain my strategy". Deterministic: same
 * params in, same string out — so it is unit-testable and cache-friendly.
 */
export function buildExplainPrompt(p: SimParams): string {
  const s = summarize(p);
  const res = run(p);
  const legs = res.blocks.flatMap((b) => b.legs);

  const legLines = legs
    .map(
      (leg, i) =>
        `${i + 1}. ${leg.startLabel} · ${leg.mat} ani · ${nf2(leg.rate)}% · ` +
        `principal ${nf0(leg.principal)} RON · cupon/an ${nf0(leg.couponAnnual)} RON · ` +
        `${leg.matured ? "scadent" : "în curs"}`,
    )
    .join("\n");

  return [
    "Explică-mi pe înțelesul tuturor această strategie ipotetică de investiție în titluri de stat Fidelis (RON).",
    "",
    "PARAMETRI",
    `- Sumă investită: ${nf0(p.amount)} RON`,
    `- Data de start: ${byId[p.startId]?.label ?? p.startId}`,
    `- Strategie: ${strategyLine(p)}`,
    "",
    "REZULTAT SIMULAT (randament ISTORIC, orizont mijlocul lui 2026)",
    `- Valoare estimată azi: ${nf0(s.finalValue)} RON`,
    `- Câștig net (neimpozabil): ${s.profit >= 0 ? "+" : ""}${nf0(s.profit)} RON`,
    `- Randament anualizat (CAGR): ${nf2(s.cagr)}%`,
    `- Orizont: ${nf2(s.years)} ani`,
    "",
    "DETALIU PE TRANȘE",
    legLines,
    "",
    "TE ROG",
    "1. Explică ce înseamnă această strategie și cum funcționează cupoanele anuale neimpozabile.",
    "2. Care sunt principalele riscuri și limitări (deținere până la scadență, vânzare anticipată pe bursă la preț de piață, inflație, risc de reinvestire)?",
    "3. Ce compromisuri implică alegerile de mai sus (maturitate, ladder vs. o emisiune, reinvestire, tranșa donator)?",
    "",
    "Notă: sunt randamente istorice simulate, în scop educativ — nu este consultanță de investiții. Nu-mi da recomandări de a cumpăra sau vinde; explică-mi doar mecanica și compromisurile.",
  ].join("\n");
}

/** Base URL for a new, prefilled claude.ai conversation. */
export const CLAUDE_NEW_URL = "https://claude.ai/new";

/** Deep-link that opens claude.ai with the prompt prefilled in the composer. */
export function claudeDeepLink(prompt: string): string {
  return `${CLAUDE_NEW_URL}?q=${encodeURIComponent(prompt)}`;
}
