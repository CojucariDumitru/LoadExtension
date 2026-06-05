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

const contentCtx = await esbuild.context({
  ...shared,
  entryPoints: ["content/content.js"],
  outfile: "dist/content.js"
});

const backgroundCtx = await esbuild.context({
  ...shared,
  entryPoints: ["background/service-worker.js"],
  outfile: "dist/background.js"
});

await contentCtx.watch();
await backgroundCtx.watch();

console.log("Watching content/ and background/ — reload the extension in chrome://extensions after saves.");
