import "./ui/styles.css";
import { createApp } from "./ui/app";
import { initScenarios } from "./ui/scenarios";
import { initExport } from "./ui/export";
import { decodeParams, encodeParams } from "./scenario/codec";

/** Read a shared scenario off the URL hash (`#s?...`), if present and valid. */
function paramsFromHash() {
  const q = location.hash.indexOf("?");
  return q >= 0 ? decodeParams(location.hash.slice(q + 1)) : null;
}

const app = createApp(paramsFromHash());

// Keep the address bar shareable: reflect the live parameters into the hash.
app.subscribe((p) => {
  const hash = `#s?${encodeParams(p)}`;
  if (location.hash !== hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }
});

const panel = initScenarios(app);
initExport(app, panel.currentTitle);
