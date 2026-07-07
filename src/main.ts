import "./ui/styles.css";
import { createApp } from "./ui/app";

createApp();

// Register the service worker (PWA offline support) in production builds only,
// so dev/HMR is never served from cache. The relative URL resolves against the
// document base, so the scope is correct on a GitHub Pages subpath too.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline-first is a progressive enhancement; ignore registration errors */
    });
  });
}
