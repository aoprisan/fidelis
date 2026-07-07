/*
 * Rasterize the PWA icon SVGs (public/*.svg) into the PNG sizes the manifest
 * and iOS need. Dev-only utility — not part of the build or test pipeline.
 *
 * Requires a Playwright/Chromium available on the machine. Run with:
 *   node scripts/gen-icons.mjs
 * Point PW_CHROMIUM at a Chromium binary if Playwright can't find one, and
 * PW_MODULE at a Playwright install if it isn't a local dependency.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_MODULE || "playwright");

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");

// [source svg, output png, size, transparent-corners?]
const JOBS = [
  ["icon.svg", "icon-192.png", 192, true],
  ["icon.svg", "icon-512.png", 512, true],
  ["icon-maskable.svg", "icon-maskable-192.png", 192, false],
  ["icon-maskable.svg", "icon-maskable-512.png", 512, false],
  ["icon-maskable.svg", "apple-touch-icon.png", 180, false],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
try {
  for (const [src, out, size, transparent] of JOBS) {
    const svg = readFileSync(join(pub, src), "utf8");
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: "networkidle" },
    );
    await page.screenshot({
      path: join(pub, out),
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: transparent,
    });
    await page.close();
    console.log(`wrote public/${out} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
