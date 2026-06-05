import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const shared = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome120",
  logLevel: "info"
};

await esbuild.build({
  ...shared,
  entryPoints: ["content/content.js"],
  outfile: "dist/content.js"
});

await esbuild.build({
  ...shared,
  entryPoints: ["background/service-worker.js"],
  outfile: "dist/background.js"
});

console.log("Build complete.");
