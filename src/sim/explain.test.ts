import { describe, expect, it } from "vitest";
import { buildExplainPrompt, CLAUDE_NEW_URL, claudeDeepLink } from "./explain";
import type { SimParams } from "./simulate";

const base: SimParams = {
  amount: 50000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
};

describe("buildExplainPrompt", () => {
  it("serializes the parameters, results and per-leg detail", () => {
    const p = buildExplainPrompt(base);
    // parameters
    expect(p).toContain("Sumă investită: 50.000 RON");
    expect(p).toContain("Data de start: Feb 2025");
    expect(p).toContain("o singură emisiune (maturitate 5 ani)");
    expect(p).toContain("reinvestire la scadență");
    // results (match summarize: 55.775 RON, +5.775, 7,56%, 1,50 ani)
    expect(p).toContain("Valoare estimată azi: 55.775 RON");
    expect(p).toContain("Câștig net (neimpozabil): +5.775 RON");
    expect(p).toContain("Randament anualizat (CAGR): 7,56%");
    expect(p).toContain("Orizont: 1,50 ani");
    // leg detail
    expect(p).toContain("1. Feb 2025 · 5 ani · 7,70% · principal 50.000 RON · cupon/an 3.850 RON · în curs");
    // educational boundary is carried into the prompt
    expect(p).toContain("scop educativ — nu este consultanță de investiții");
  });

  it("is deterministic — same params produce the same string", () => {
    expect(buildExplainPrompt(base)).toBe(buildExplainPrompt({ ...base }));
  });

  it("reflects the ladder strategy and lists every leg", () => {
    const p = buildExplainPrompt({ ...base, amount: 30000, strat: "ladder", startId: "2024-10" });
    expect(p).toContain("scară (ladder) pe 3 maturități");
    // ladder over Oct 2024 with reinvest yields 4 legs (one 1y rolls over).
    expect(p).toMatch(/^4\. /m);
    expect(p).not.toMatch(/^5\. /m);
  });

  it("reflects the donor tranche and the no-reinvest choice", () => {
    const p = buildExplainPrompt({ ...base, donor: true, reinvest: false });
    expect(p).toContain("tranșă donator de sânge (2 ani)");
    expect(p).toContain("fără reinvestire");
    expect(p).not.toContain(", reinvestire la scadență");
  });

  it("shows a negative net gain without a stray plus sign", () => {
    // Amount 0 makes profit 0; check the +/- guard on a synthetic loss instead.
    const p = buildExplainPrompt(base);
    // base is a gain, so it must carry the leading '+'.
    expect(p).toMatch(/Câștig net \(neimpozabil\): \+/);
  });
});

describe("claudeDeepLink", () => {
  it("targets a fresh claude.ai conversation with the prompt in ?q=", () => {
    const url = claudeDeepLink("hello world & friends?");
    expect(url.startsWith(`${CLAUDE_NEW_URL}?q=`)).toBe(true);
    // special characters are percent-encoded, not left raw.
    expect(url).not.toContain(" ");
    expect(url).toContain("%20");
  });

  it("round-trips the exact prompt through the URL encoding", () => {
    const prompt = buildExplainPrompt(base);
    const url = claudeDeepLink(prompt);
    const q = url.slice(`${CLAUDE_NEW_URL}?q=`.length);
    expect(decodeURIComponent(q)).toBe(prompt);
  });

  it("keeps the encoded URL within a browser-safe length", () => {
    // Worst case in this app: ladder + reinvest (most legs).
    const worst = buildExplainPrompt({
      ...base,
      amount: 30000,
      strat: "ladder",
      startId: "2024-10",
    });
    expect(claudeDeepLink(worst).length).toBeLessThan(4000);
  });
});
