import { defineConfig } from "vitest/config";

// Relative base so the built site works from any GitHub Pages path
// (both `user.github.io/repo/` project pages and custom domains).
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
