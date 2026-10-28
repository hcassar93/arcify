import { Resvg } from "@resvg/resvg-js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
// Third-party Arc logo. Source and rights distinction: THIRD_PARTY_ASSETS.md.
await mkdir("public/icons", { recursive: true });
// Rasterizer lacks CSS Color 4: retain the official sRGB fill attributes.
const svg = (await readFile("public/brand/arc-logo.svg", "utf8"))
  .replace(/ style="[^"]*"/g, "")
  .replace('height="219.92"', 'height="262.329"')
  .replace(
    'viewBox="0 0 262.329 219.92"',
    'viewBox="0 -21.2045 262.329 262.329"',
  );
for (const width of [16, 32, 48, 128])
  await writeFile(
    `public/icons/arcify-${width}.png`,
    new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng(),
  );
