// Bundles src/main.ts into the directory the Go binary embeds. Mermaid is loaded with a dynamic
// import, so esbuild splits it into its own chunks and the editor starts without it.
import { rm } from "node:fs/promises";
import { build } from "esbuild";

const outdir = new URL("../internal/web/static/dist/", import.meta.url).pathname;
await rm(outdir, { recursive: true, force: true });

await build({
  entryPoints: ["src/main.ts"],
  outdir,
  entryNames: "app",
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});
