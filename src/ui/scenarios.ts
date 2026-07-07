import { byId } from "../sim/history";
import type { SimParams } from "../sim/simulate";
import { ScenarioStore } from "../scenario/store";
import type { AppController } from "./app";
import { fmt } from "./format";

/**
 * The "Scenarii salvate" panel: name + save the current parameters, then load,
 * rename, update, or delete saved scenarios. State lives in `localStorage` via
 * `ScenarioStore`; this module is only the DOM glue around it.
 */

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const now = () => Date.now();

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `s-${now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function summaryLine(p: SimParams): string {
  const strat = p.strat === "ladder" ? "Scară" : `${p.mat}a`;
  const tags = [p.donor ? "donator" : null, p.reinvest ? "reinv." : null]
    .filter(Boolean)
    .join(", ");
  return `${fmt(p.amount)} RON · ${byId[p.startId].label} · ${strat}${tags ? ` · ${tags}` : ""}`;
}

/** Public handle: exposes the current title used for exports/share. */
export interface ScenarioPanel {
  currentTitle(): string;
}

export function initScenarios(
  app: AppController,
  store: ScenarioStore,
  onChange?: () => void,
): ScenarioPanel {
  const nameInput = el<HTMLInputElement>("scName");
  const saveBtn = el<HTMLButtonElement>("scSave");
  const listEl = el("scList");

  let activeId: string | null = null;

  const currentTitle = () => {
    const typed = nameInput.value.trim();
    if (typed) return typed;
    if (activeId) {
      const found = store.all().find((s) => s.id === activeId);
      if (found) return found.name;
    }
    return "Scenariu curent";
  };

  function setActive(id: string | null) {
    activeId = id;
    listEl
      .querySelectorAll<HTMLElement>(".sc-row")
      .forEach((row) => row.classList.toggle("active", row.dataset.id === id));
    saveBtn.textContent = id ? "Actualizează" : "Salvează";
  }

  function render() {
    const list = store.all().sort((a, b) => b.updatedAt - a.updatedAt);
    if (list.length === 0) {
      listEl.innerHTML = `<p class="sc-empty">Niciun scenariu salvat încă. Configurează parametrii și salvează-i.</p>`;
      return;
    }
    listEl.innerHTML = list
      .map(
        (s) => `<div class="sc-row" data-id="${s.id}">
          <button class="sc-load" data-id="${s.id}" title="Încarcă scenariul">
            <span class="sc-name">${escapeHtml(s.name)}</span>
            <span class="sc-meta">${escapeHtml(summaryLine(s.params))}</span>
          </button>
          <div class="sc-actions">
            <button class="sc-icon" data-act="rename" data-id="${s.id}" title="Redenumește" aria-label="Redenumește">✎</button>
            <button class="sc-icon" data-act="delete" data-id="${s.id}" title="Șterge" aria-label="Șterge">🗑</button>
          </div>
        </div>`,
      )
      .join("");

    listEl.querySelectorAll<HTMLButtonElement>(".sc-load").forEach((b) => {
      b.onclick = () => {
        const s = store.all().find((x) => x.id === b.dataset.id);
        if (!s) return;
        app.setParams(s.params);
        nameInput.value = s.name;
        setActive(s.id);
      };
    });
    listEl.querySelectorAll<HTMLButtonElement>(".sc-icon").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id!;
        if (b.dataset.act === "delete") {
          const s = store.all().find((x) => x.id === id);
          if (s && window.confirm(`Ștergi scenariul „${s.name}”?`)) {
            store.remove(id);
            if (activeId === id) setActive(null);
            render();
            onChange?.();
          }
        } else if (b.dataset.act === "rename") {
          const s = store.all().find((x) => x.id === id);
          const next = window.prompt("Nume nou:", s?.name ?? "");
          if (next && next.trim()) {
            store.rename(id, next, now());
            if (activeId === id) nameInput.value = next.trim();
            render();
            onChange?.();
          }
        }
      };
    });
    setActive(activeId);
  }

  saveBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.classList.add("invalid");
      setTimeout(() => nameInput.classList.remove("invalid"), 800);
      return;
    }
    const params = app.getParams();
    const ts = now();
    if (activeId) {
      const existing = store.all().find((s) => s.id === activeId);
      store.save({
        id: activeId,
        name,
        params,
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
    } else {
      const id = newId();
      store.save({ id, name, params, createdAt: ts, updatedAt: ts });
      setActive(id);
    }
    render();
    onChange?.();
  };

  // A "new / clear" affordance: clicking the label resets the editing target.
  el("scNew").onclick = () => {
    nameInput.value = "";
    setActive(null);
    nameInput.focus();
  };

  render();
  return { currentTitle };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
