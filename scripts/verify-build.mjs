import { readFileSync, existsSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const content = readFileSync("dist/content.js", "utf8");
const popup = existsSync("dist/popup.js") ? readFileSync("dist/popup.js", "utf8") : "";
const rtsCapture = existsSync("dist/rts-capture.js") ? readFileSync("dist/rts-capture.js", "utf8") : "";

const version = manifest.version;
const usesBootstrap = manifest.content_scripts?.[0]?.js?.includes("content/bootstrap.js");
const usesBundledRts = manifest.content_scripts?.[1]?.js?.includes("dist/rts-capture.js");
const hasBuildVersion = content.includes("0.4.2");
const hasOldToolbar = content.includes("loads scanned") || content.includes("Min RPM");
const popupBundled = popup.length > 1000 && !popup.includes("import ");
const rtsBundled = rtsCapture.length > 500 && !rtsCapture.includes("import ");

console.log(`\nLoadExtension build check`);
console.log(`  manifest version : ${version}`);
console.log(`  bootstrap entry  : ${usesBootstrap ? "yes" : "NO"}`);
console.log(`  bundled popup    : ${popupBundled ? "yes" : "NO"}`);
console.log(`  bundled rts      : ${usesBundledRts && rtsBundled ? "yes" : "NO"}`);
console.log(`  dist/content.js  : ${(content.length / 1024).toFixed(1)}kb`);

if (
  version === "0.4.2" &&
  usesBootstrap &&
  usesBundledRts &&
  popupBundled &&
  rtsBundled &&
  hasBuildVersion &&
  !hasOldToolbar
) {
  console.log(`  status           : OK — reload extension in chrome://extensions\n`);
  process.exit(0);
}

console.log(`  status           : OUTDATED — run: git pull origin main && npm run build\n`);
process.exit(1);
