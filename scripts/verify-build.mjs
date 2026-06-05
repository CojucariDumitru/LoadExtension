import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const content = readFileSync("dist/content.js", "utf8");

const version = manifest.version;
const usesBootstrap = manifest.content_scripts?.[0]?.js?.includes("content/bootstrap.js");
const hasBuildVersion = content.includes("0.4.1");
const hasOldToolbar = content.includes("loads scanned") || content.includes("Min RPM");

console.log(`\nLoadExtension build check`);
console.log(`  manifest version : ${version}`);
console.log(`  bootstrap entry  : ${usesBootstrap ? "yes" : "NO — update manifest.json"}`);
console.log(`  dist/content.js  : ${(content.length / 1024).toFixed(1)}kb`);

if (version === "0.4.1" && usesBootstrap && hasBuildVersion && !hasOldToolbar) {
  console.log(`  status           : OK — reload extension in chrome://extensions\n`);
  process.exit(0);
}

console.log(`  status           : OUTDATED — your source files are old`);
console.log(`  expected         : manifest 0.4.1, bootstrap.js, ~24kb content.js`);
console.log(`  fix              : git pull origin main  (then npm run build again)\n`);
process.exit(1);
