import { describe, expect, it } from "vitest";
import { HISTORY } from "../data/history";
import { initInfo } from "./info";

/**
 * `initInfo` only assigns `container.innerHTML` (it never reads the DOM back),
 * so we can exercise it with a minimal stub and assert on the emitted markup —
 * no jsdom, keeping the suite on the repo's node environment and lean deps.
 */
function renderInfo(): string {
  const host = { innerHTML: "", addEventListener() {} };
  initInfo(host as unknown as HTMLElement);
  return host.innerHTML;
}

describe("initInfo", () => {
  const html = renderInfo();

  it("renders exactly one card per issuance", () => {
    const cards = html.match(/<article class="rate-card">/g) ?? [];
    expect(cards.length).toBe(HISTORY.length);
  });

  it("orders cards newest first", () => {
    const latest = HISTORY[HISTORY.length - 1].label;
    const oldest = HISTORY[0].label;
    expect(html.indexOf(latest)).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(latest)).toBeLessThan(html.indexOf(oldest));
  });

  it("draws both a RON and a EUR trend chart", () => {
    expect(html).toContain("Evoluția cupoanelor Cupoane în lei");
    expect(html).toContain("Evoluția cupoanelor Cupoane în euro");
    // three tiers named in the legend
    expect(html).toContain("Scurtă ·");
    expect(html).toContain("Lungă ·");
  });

  it("makes line points clickable with a value label", () => {
    const hits = html.match(/class="pt-dot" data-label="/g) ?? [];
    expect(hits.length).toBeGreaterThan(0);
    // labels carry a formatted percent, e.g. "10 ani · 6,20% · dec. 2025"
    expect(html).toMatch(/data-label="[^"]*\d+,\d{2}%/);
  });

  it("draws one small-multiple chart per maturity", () => {
    const mats = new Set<number>();
    for (const h of HISTORY) {
      for (const k of Object.keys(h.maturities)) mats.add(Number(k));
      for (const k of Object.keys(h.eur)) mats.add(Number(k));
    }
    const cells = html.match(/class="mc-cell"/g) ?? [];
    expect(cells.length).toBe(mats.size);
  });

  it("badges unverified issuances", () => {
    const flagged = HISTORY.filter((h) => h.unverified).length;
    expect(flagged).toBeGreaterThan(0);
    const badges = html.match(/class="rc-badge">neverificat</g) ?? [];
    expect(badges.length).toBe(flagged);
  });

  it("draws a donor bar for every RON and EUR donor tranche", () => {
    const ronDonors = HISTORY.filter((h) => h.donorRate != null).length;
    const eurDonors = HISTORY.filter((h) => h.donorRateEur != null).length;
    expect(ronDonors).toBeGreaterThan(0);
    expect(eurDonors).toBeGreaterThan(0);
    const donorBars = html.match(/class="rc-bar rc-bar--donor"/g) ?? [];
    expect(donorBars.length).toBe(ronDonors + eurDonors);
  });
});
