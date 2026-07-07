import { buildExplainPrompt, claudeDeepLink } from "../sim/explain";
import type { SimParams } from "../sim/simulate";

/** DOM handles the "Explain my strategy" feature drives. */
export interface ExplainEls {
  /** Anchor styled as a button; its href is set live at click time. */
  explainBtn: HTMLAnchorElement;
  copyBtn: HTMLButtonElement;
  msg: HTMLElement;
}

/**
 * Copy text to the clipboard, robustly. Prefers the async Clipboard API (needs
 * a secure context + user gesture — both hold on a button click), and falls
 * back to a hidden-textarea `execCommand("copy")` for older / insecure setups.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Wire the "Explain my strategy" deep-link and its copy-to-clipboard sibling.
 * `getParams` is read at interaction time so the prompt always reflects the
 * live portfolio state.
 *
 * The deep-link is a real `<a target="_blank" rel="noopener">`: its `href` is
 * refreshed from the current state just before the click's default navigation,
 * so the new tab always carries the up-to-date prompt. A native anchor click is
 * a top-level, user-initiated navigation — it is not caught by popup blockers
 * the way `window.open` is — and `rel="noopener"` keeps it safe. The copy
 * button is the explicit no-navigation fallback.
 */
export function wireExplain(els: ExplainEls, getParams: () => SimParams): void {
  const flash = (text: string) => {
    els.msg.textContent = text;
  };

  // Refresh the href before navigation. pointerdown fires before the click's
  // default action (covers mouse/touch/pen); the click handler covers keyboard
  // activation. Setting href in either case navigates to the fresh URL.
  const refreshHref = () => {
    els.explainBtn.href = claudeDeepLink(buildExplainPrompt(getParams()));
  };
  els.explainBtn.addEventListener("pointerdown", refreshHref);
  els.explainBtn.addEventListener("click", () => {
    refreshHref();
    flash("Se deschide Claude într-o filă nouă cu strategia precompletată…");
  });

  els.copyBtn.onclick = () => {
    const prompt = buildExplainPrompt(getParams());
    void copyText(prompt).then((ok) =>
      flash(ok ? "Prompt copiat în clipboard." : "Copierea a eșuat — selectează și copiază manual."),
    );
  };

  // Set an initial href so the link is valid even before any interaction.
  refreshHref();
}
