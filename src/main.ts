import "./ui/styles.css";
import { createApp } from "./ui/app";
import { initHook } from "./ui/hook";
import { initScenarios } from "./ui/scenarios";
import { initCompare } from "./ui/compare";
import { initExport } from "./ui/export";
import { decodeParams, encodeParams } from "./scenario/codec";
import { ScenarioStore, safeStorage } from "./scenario/store";

/** Read a shared scenario off the URL hash (`#s?...`), if present and valid. */
function paramsFromHash() {
  const q = location.hash.indexOf("?");
  return q >= 0 ? decodeParams(location.hash.slice(q + 1)) : null;
}

initHook();
const app = createApp(paramsFromHash());

// Keep the address bar shareable: reflect the live parameters into the hash.
app.subscribe((p) => {
  const hash = `#s?${encodeParams(p)}`;
  if (location.hash !== hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }
});

// One shared store so the save panel and the comparison view stay in sync.
const store = new ScenarioStore(safeStorage());
let compare: { refresh(): void } | undefined;
const panel = initScenarios(app, store, () => compare?.refresh());
compare = initCompare(app, store, () => panel.currentTitle());
initExport(app, panel.currentTitle);
