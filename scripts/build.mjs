import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const esm = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome120",
  logLevel: "info"
};

const iife = {
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  logLevel: "info"
};

await esbuild.build({
  ...esm,
  entryPoints: ["content/content.js"],
  outfile: "dist/content.js"
});

await esbuild.build({
  ...esm,
  entryPoints: ["background/service-worker.js"],
  outfile: "dist/background.js"
});

await esbuild.build({
  ...iife,
  entryPoints: ["popup/popup.js"],
  outfile: "dist/popup.js"
});

await esbuild.build({
  ...iife,
  entryPoints: ["options/options.js"],
  outfile: "dist/options.js"
});

await esbuild.build({
  ...iife,
  entryPoints: ["content/rts-capture.js"],
  outfile: "dist/rts-capture.js"
});

console.log("Build complete.");
