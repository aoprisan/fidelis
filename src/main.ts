import "./ui/styles.css";
import { createApp } from "./ui/app";
import { initHook } from "./ui/hook";
import { initInfo } from "./ui/info";
import { initPlan } from "./ui/plan";
import { initTabs } from "./ui/tabs";
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
const shared = paramsFromHash();

// Tabs: land on Plan by default, but on Avansat when the URL carries a shared
// scenario so share-links open straight onto the simulator, not the placeholder.
initTabs(shared ? "advanced" : "plan");
const infoView = document.getElementById("view-info");
if (infoView) initInfo(infoView);
initPlan();

const app = createApp(shared);

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
