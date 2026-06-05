import { readFileSync, existsSync } from "node:fs";

const REQUIRED = readFileSync("VERSION", "utf8").trim();
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const content = readFileSync("dist/content.js", "utf8");
const popup = existsSync("dist/popup.js") ? readFileSync("dist/popup.js", "utf8") : "";
const rtsCapture = existsSync("dist/rts-capture.js") ? readFileSync("dist/rts-capture.js", "utf8") : "";

const version = manifest.version;
const usesBootstrap = manifest.content_scripts?.[0]?.js?.includes("content/bootstrap.js");
const usesBundledRts = manifest.content_scripts?.[1]?.js?.includes("dist/rts-capture.js");
const hasBuildVersion = content.includes(REQUIRED);
const hasOldToolbar = content.includes("loads scanned") || content.includes("Min RPM");
const popupBundled = popup.length > 1000 && !popup.includes("import ");
const rtsBundled = rtsCapture.length > 500 && !rtsCapture.includes("import ");
const contentSizeKb = content.length / 1024;

console.log(`\nLoadExtension build check`);
console.log(`  your version     : ${version}`);
console.log(`  required version : ${REQUIRED}`);
console.log(`  bootstrap entry  : ${usesBootstrap ? "yes" : "NO"}`);
console.log(`  bundled popup    : ${popupBundled ? "yes" : "NO — missing dist/popup.js"}`);
console.log(`  bundled rts      : ${usesBundledRts && rtsBundled ? "yes" : "NO — missing dist/rts-capture.js"}`);
console.log(`  dist/content.js  : ${contentSizeKb.toFixed(1)}kb (need ~27kb)`);

const ok =
  version === REQUIRED &&
  usesBootstrap &&
  usesBundledRts &&
  popupBundled &&
  rtsBundled &&
  hasBuildVersion &&
  !hasOldToolbar &&
  contentSizeKb >= 26;

if (ok) {
  console.log(`  status           : OK — reload extension in chrome://extensions`);
  console.log(`  load from        : this folder (avoid OneDrive Desktop copies)\n`);
  process.exit(0);
}

console.log(`  status           : OUTDATED or INCOMPLETE`);
console.log(`  fix              : powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1\n`);
process.exit(1);
