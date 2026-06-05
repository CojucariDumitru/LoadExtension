import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync("icons/logo.svg");
for (const size of [16, 48, 128]) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size }
  });
  const png = resvg.render().asPng();
  writeFileSync(`icons/icon${size}.png`, png);
  console.log(`icons/icon${size}.png`);
}
